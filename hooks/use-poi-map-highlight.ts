/**
 * POI 地图高亮 Hook
 * 负责高亮效果、选点预览标记和地图聚焦响应
 */

import { useEffect } from "react";
import { useSchoolStore, type FocusCampusPayload } from "@/store/use-school-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import { getHighlightMarkerContent, getPickMarkerContent, AMAP_Z_INDEX } from "@/lib/poi-map";
import type { School } from "@/store/use-school-store";
import type { CampusAreaItem } from "@/lib/school/actions";
import type { POIWithStatus } from "@/lib/geo/poi-utils";

export interface UsePOIMapHighlightOptions {
  amap: any;
  mapInstanceRef: React.MutableRefObject<any>;
  mapReady: boolean;
  school: School | null;
  pois: POIWithStatus[];
  campuses: CampusAreaItem[];
  highlightMarkerRef: React.MutableRefObject<any>;
  pickStartMarkerRef: React.MutableRefObject<any>;
  pickEndMarkerRef: React.MutableRefObject<any>;
}

export function usePOIMapHighlight(options: UsePOIMapHighlightOptions): void {
  const {
    amap,
    mapInstanceRef,
    mapReady,
    school,
    pois,
    campuses,
    highlightMarkerRef,
    pickStartMarkerRef,
    pickEndMarkerRef,
  } = options;

  const {
    focusMapTrigger,
    focusCampusTrigger,
    focusCampusPayload,
    activeSchool,
    highlightSubPOI,
    setHighlightSubPOI,
    highlightedPoiId,
    setHighlightPoi,
  } = useSchoolStore();

  const { startPoint, endPoint, routeInfo } = useNavigationStore();

  // 临时高亮子 POI
  useEffect(() => {
    if (!amap || !mapInstanceRef.current) return;

    if (highlightMarkerRef.current) {
      mapInstanceRef.current.remove(highlightMarkerRef.current);
      highlightMarkerRef.current = null;
    }

    if (highlightSubPOI) {
      const marker = new amap.Marker({
        position: [highlightSubPOI.lng, highlightSubPOI.lat],
        title: highlightSubPOI.name,
        content: getHighlightMarkerContent(),
        offset: new amap.Pixel(-12, -12),
        zIndex: AMAP_Z_INDEX.highlightPulse,
      });
      marker.setMap(mapInstanceRef.current);
      highlightMarkerRef.current = marker;

      mapInstanceRef.current.panTo([highlightSubPOI.lng, highlightSubPOI.lat], false, 300);
      mapInstanceRef.current.setZoom(18);

      const timer = setTimeout(() => setHighlightSubPOI(null), 5000);

      return () => {
        clearTimeout(timer);
        if (highlightMarkerRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.remove(highlightMarkerRef.current);
          highlightMarkerRef.current = null;
        }
      };
    }
  }, [amap, highlightSubPOI, setHighlightSubPOI, highlightMarkerRef, mapInstanceRef]);

  // 响应 highlightedPoiId
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !highlightedPoiId || !pois.length) return;

    const poi = pois.find((p) => p.id === highlightedPoiId);
    if (!poi) return;

    mapInstanceRef.current.panTo([poi.lng, poi.lat], false, 400);
    mapInstanceRef.current.setZoom(poi.parentId ? 18 : 17);

    const timer = setTimeout(() => setHighlightPoi(null), 5000);
    return () => clearTimeout(timer);
  }, [amap, highlightedPoiId, pois, setHighlightPoi, mapInstanceRef]);

  // 选点预览标记
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || routeInfo) return;

    const map = mapInstanceRef.current;
    const toRemove: any[] = [];

    if (startPoint) {
      if (pickStartMarkerRef.current) toRemove.push(pickStartMarkerRef.current);
      const m = new amap.Marker({
        position: [startPoint.lng, startPoint.lat],
        content: getPickMarkerContent("start"),
        offset: new amap.Pixel(-12, -12),
        zIndex: AMAP_Z_INDEX.navRoute,
      });
      m.setMap(map);
      pickStartMarkerRef.current = m;
    } else if (pickStartMarkerRef.current) {
      toRemove.push(pickStartMarkerRef.current);
      pickStartMarkerRef.current = null;
    }

    if (endPoint) {
      if (pickEndMarkerRef.current) toRemove.push(pickEndMarkerRef.current);
      const m = new amap.Marker({
        position: [endPoint.lng, endPoint.lat],
        content: getPickMarkerContent("end"),
        offset: new amap.Pixel(-12, -12),
        zIndex: AMAP_Z_INDEX.navRoute,
      });
      m.setMap(map);
      pickEndMarkerRef.current = m;
    } else if (pickEndMarkerRef.current) {
      toRemove.push(pickEndMarkerRef.current);
      pickEndMarkerRef.current = null;
    }

    toRemove.forEach((obj) => {
      try { map.remove(obj); } catch (e) { console.warn("清除选点标记失败:", e); }
    });

    return () => {
      if (pickStartMarkerRef.current && map) {
        try { map.remove(pickStartMarkerRef.current); } catch {}
        pickStartMarkerRef.current = null;
      }
      if (pickEndMarkerRef.current && map) {
        try { map.remove(pickEndMarkerRef.current); } catch {}
        pickEndMarkerRef.current = null;
      }
    };
  }, [amap, startPoint, endPoint, routeInfo, pickStartMarkerRef, pickEndMarkerRef, mapInstanceRef]);

  // 响应 focusMapTrigger（点击学校名称）
  useEffect(() => {
    const sch = activeSchool;
    const schoolCenterOk = sch != null && sch.centerLng != null && sch.centerLat != null;
    const rawCenter = campuses.length > 0 ? campuses[0].center : null;
    const campusCenter: [number, number] | null = (() => {
      if (!rawCenter) return null;
      if (Array.isArray(rawCenter) && rawCenter.length >= 2) return [Number(rawCenter[0]), Number(rawCenter[1])];
      const c = rawCenter as { coordinates?: number[] };
      if (c?.coordinates && Array.isArray(c.coordinates) && c.coordinates.length >= 2) return [Number(c.coordinates[0]), Number(c.coordinates[1])];
      return null;
    })();
    const center: [number, number] | null = schoolCenterOk
      ? [sch!.centerLng!, sch!.centerLat!]
      : campusCenter && !isNaN(campusCenter[0]) && !isNaN(campusCenter[1]) ? campusCenter : null;

    if (focusMapTrigger <= 0 || !sch || !center || !mapInstanceRef.current) return;
    mapInstanceRef.current.setZoomAndCenter(16, center, false, 600);
  }, [focusMapTrigger, activeSchool, mapReady, campuses, mapInstanceRef]);

  // 响应 focusCampusTrigger（聚焦到校区）
  useEffect(() => {
    if (focusCampusTrigger <= 0 || !focusCampusPayload || !mapInstanceRef.current || !amap) return;

    const { center, boundary } = focusCampusPayload;
    const centerArr: [number, number] = Array.isArray(center)
      ? [Number(center[0]), Number(center[1])]
      : [Number((center as { coordinates?: number[] })?.coordinates?.[0] ?? 0), Number((center as { coordinates?: number[] })?.coordinates?.[1] ?? 0)];
    if (isNaN(centerArr[0]) || isNaN(centerArr[1])) return;

    if (boundary?.type === "Polygon" && boundary.coordinates?.[0]?.length) {
      try {
        const path = boundary.coordinates[0].map((c: number[]) => [c[0], c[1]]);
        const poly = new amap.Polygon({ path, strokeColor: "transparent", fillColor: "transparent" });
        poly.setMap(mapInstanceRef.current);
        mapInstanceRef.current.setFitView([poly], false, [60, 60, 60, 60], 16);
        poly.setMap(null);
      } catch {
        mapInstanceRef.current.setZoomAndCenter(16, centerArr, false, 600);
      }
    } else {
      mapInstanceRef.current.setZoomAndCenter(16, centerArr, false, 600);
    }
  }, [focusCampusTrigger, focusCampusPayload, amap, mapInstanceRef]);
}