/**
 * POI 地图导航 Hook
 * 负责路径规划（Walking/Riding）和路线绘制
 */

import { useEffect, useRef, useCallback } from "react";
import { notify } from "@/lib/ui/notify";
import { useNavigationStore } from "@/store/use-navigation-store";
import { CoordinateConverter } from "@/lib/geo/amap-loader";
import { getStartEndMarkerContent, ROUTE_POLYLINE_STYLE, NAV_FIT_VIEW_PADDING, AMAP_Z_INDEX } from "@/lib/poi-map";
import { analytics } from "@/lib/analytics";

export interface UsePOIMapNavigationOptions {
  amap: any;
  mapInstanceRef: React.MutableRefObject<any>;
  mapReady: boolean;
  routePolylineRef: React.MutableRefObject<any>;
  startMarkerRef: React.MutableRefObject<any>;
  endMarkerRef: React.MutableRefObject<any>;
  pickStartMarkerRef: React.MutableRefObject<any>;
  pickEndMarkerRef: React.MutableRefObject<any>;
  walkingRef: React.MutableRefObject<any>;
  ridingRef: React.MutableRefObject<any>;
}

export function usePOIMapNavigation(options: UsePOIMapNavigationOptions): void {
  const {
    amap,
    mapInstanceRef,
    routePolylineRef,
    startMarkerRef,
    endMarkerRef,
    pickStartMarkerRef,
    pickEndMarkerRef,
    walkingRef,
    ridingRef,
  } = options;

  const searchIdRef = useRef(0);

  const {
    isNavigating,
    startPoint,
    endPoint,
    routeInfo,
    navMode,
    stopNavigation,
    updateRouteInfo,
    setRouteSteps,
  } = useNavigationStore();

  // 清除导航覆盖物
  const clearNavigationOverlay = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const toRemove: any[] = [];
    if (routePolylineRef.current) { toRemove.push(routePolylineRef.current); routePolylineRef.current = null; }
    if (startMarkerRef.current) { toRemove.push(startMarkerRef.current); startMarkerRef.current = null; }
    if (endMarkerRef.current) { toRemove.push(endMarkerRef.current); endMarkerRef.current = null; }
    if (pickStartMarkerRef.current) { toRemove.push(pickStartMarkerRef.current); pickStartMarkerRef.current = null; }
    if (pickEndMarkerRef.current) { toRemove.push(pickEndMarkerRef.current); pickEndMarkerRef.current = null; }

    toRemove.forEach((obj) => {
      try { map.remove(obj); } catch (e) { console.warn("清除导航覆盖物失败:", e); }
    });

    walkingRef.current = null;
    ridingRef.current = null;
  }, [mapInstanceRef, routePolylineRef, startMarkerRef, endMarkerRef, pickStartMarkerRef, pickEndMarkerRef, walkingRef, ridingRef]);

  // 导航功能
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !isNavigating || !startPoint || !endPoint) return;

    const startNav = async () => {
      try {
        clearNavigationOverlay();

        const startValid = CoordinateConverter.isValidGCJ02(startPoint.lng, startPoint.lat);
        const endValid = CoordinateConverter.isValidGCJ02(endPoint.lng, endPoint.lat);

        if (!startValid || !endValid) {
          console.warn("导航起点或终点不在高德地图服务范围内");
          notify.error("当前起点或终点不在支持范围内，暂不提供导航服务。");
          stopNavigation();
          return;
        }

        const isRide = navMode === "ride";
        const PluginClass = isRide ? amap.Riding : amap.Walking;
        const pluginName = isRide ? "AMap.Riding" : "AMap.Walking";

        if (!PluginClass) {
          console.error(`${pluginName} 插件未加载`);
          notify.error("导航服务加载失败，请稍后重试。");
          stopNavigation();
          return;
        }

        const planner = new PluginClass({ hideMarkers: true });
        if (isRide) { ridingRef.current = planner; walkingRef.current = null; }
        else { walkingRef.current = planner; ridingRef.current = null; }

        if (typeof planner.clear === "function") {
          try { planner.clear(); } catch {}
        }

        const currentSearchId = ++searchIdRef.current;

        planner.search(
          [startPoint.lng, startPoint.lat],
          [endPoint.lng, endPoint.lat],
          (status: string, result: any) => {
            if (currentSearchId !== searchIdRef.current) return;

            if (status === "complete") {
              clearNavigationOverlay();

              if (!result.routes || result.routes.length === 0) {
                analytics.nav.routePlanFail({ error_reason: "no_routes" });
                stopNavigation();
                return;
              }

              const route = result.routes[0];
              const distance = route.distance;
              const duration = Math.round(route.time / 60);
              const stepsArray = route.rides ?? route.steps ?? [];

              const path: [number, number][] = [];
              const stepsSummary: { instruction: string; distance: number }[] = [];

              const parsePoint = (point: any): [number, number] | null => {
                if (Array.isArray(point) && point.length >= 2) return [Number(point[0]), Number(point[1])];
                if (point && typeof point.getLng === "function" && typeof point.getLat === "function") return [point.getLng(), point.getLat()];
                if (point && typeof point.lng === "number" && typeof point.lat === "number") return [point.lng, point.lat];
                return null;
              };

              stepsArray.forEach((step: any) => {
                if (step.path && Array.isArray(step.path)) {
                  step.path.forEach((point: any) => {
                    const p = parsePoint(point);
                    if (p) path.push(p);
                  });
                }
                if (step.polyline && typeof step.polyline === "string") {
                  step.polyline.split(";").forEach((seg: string) => {
                    const parts = seg.trim().split(",");
                    if (parts.length >= 2) {
                      const lng = parseFloat(parts[0]);
                      const lat = parseFloat(parts[1]);
                      if (!isNaN(lng) && !isNaN(lat)) path.push([lng, lat]);
                    }
                  });
                }
                if (step.instruction) {
                  stepsSummary.push({ instruction: step.instruction, distance: step.distance ?? 0 });
                }
              });

              updateRouteInfo({ distance, duration, path });
              setRouteSteps(stepsSummary);
              analytics.nav.routePlanSuccess({ distance_m: distance, duration_s: duration * 60, nav_mode: navMode });

              if (path.length < 2) return;

              const style = isRide ? ROUTE_POLYLINE_STYLE.ride : ROUTE_POLYLINE_STYLE.walk;
              const polyline = new amap.Polyline({
                path,
                ...style,
                strokeStyle: "solid",
                lineJoin: "round",
                lineCap: "round",
                showDir: true,
                zIndex: AMAP_Z_INDEX.navEndpoint,
              });
              routePolylineRef.current = polyline;
              polyline.setMap(mapInstanceRef.current);

              const startMarker = new amap.Marker({
                position: [startPoint.lng, startPoint.lat],
                content: getStartEndMarkerContent("start"),
                offset: new amap.Pixel(-12, -12),
                zIndex: AMAP_Z_INDEX.navRouteActive,
              });
              startMarker.setMap(mapInstanceRef.current);
              startMarkerRef.current = startMarker;

              const endMarker = new amap.Marker({
                position: [endPoint.lng, endPoint.lat],
                content: getStartEndMarkerContent("end"),
                offset: new amap.Pixel(-12, -12),
                zIndex: AMAP_Z_INDEX.navRouteActive,
              });
              endMarker.setMap(mapInstanceRef.current);
              endMarkerRef.current = endMarker;

              try {
                mapInstanceRef.current.setFitView([polyline, startMarker, endMarker], false, NAV_FIT_VIEW_PADDING, 18);
              } catch {
                mapInstanceRef.current.panTo([endPoint.lng, endPoint.lat]);
              }
            } else if (status === "error") {
              if (currentSearchId !== searchIdRef.current) return;
              console.error("路径规划失败:", result);
              analytics.nav.routePlanFail({
                error_reason: result?.info === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : (result?.message ?? "unknown"),
                nav_mode: navMode,
              });
              notify.error(result?.info === "OUT_OF_SERVICE" ? `当前区域暂不支持${isRide ? "骑行" : "步行"}导航服务。` : "路径规划失败，请稍后重试。");
              stopNavigation();
            }
          }
        );
      } catch (error) {
        console.error("导航功能初始化失败:", error);
        notify.error("导航初始化失败，请稍后重试。");
        stopNavigation();
      }
    };

    startNav();

    return () => clearNavigationOverlay();
  }, [amap, isNavigating, navMode, startPoint, endPoint, updateRouteInfo, setRouteSteps, stopNavigation, clearNavigationOverlay]);

  // 停止导航时清除覆盖物
  useEffect(() => {
    if (!isNavigating) clearNavigationOverlay();
  }, [isNavigating, clearNavigationOverlay]);
}