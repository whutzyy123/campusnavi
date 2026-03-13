/**
 * POI 地图组件
 * 支持显示学校边界和 POI 标记
 */

"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { centroid, polygon } from "@turf/turf";
import { ensureLngLat } from "@/lib/campus-label-utils";
import { useAMap } from "@/hooks/use-amap";
import { CoordinateConverter } from "@/lib/amap-loader";
import { analytics } from "@/lib/analytics";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSchoolStore } from "@/store/use-school-store";
import { useFilterStore } from "@/store/use-filter-store";
import type { School, MapViewState } from "@/store/use-school-store";
import type { POIWithStatus } from "@/lib/poi-utils";
import { getCategoryIcon } from "@/lib/poi-utils";
import { getActiveStatusesBySchool } from "@/lib/status-actions";
import { getCampuses, type CampusAreaItem } from "@/lib/school-actions";

interface POIMapProps {
  school: School | null;
  pois: POIWithStatus[];
  userLocation?: [number, number]; // [lng, lat]
  onPOIClick?: (poi: POIWithStatus, view?: MapViewState | null) => void;
  /** 点击地图空白处时调用（用于关闭抽屉等） */
  onMapBackgroundClick?: () => void;
  onLocationUpdate?: (location: [number, number]) => void;
  onLocatingChange?: (isLocating: boolean) => void;
  className?: string;
}

export interface POIMapRef {
  locate: () => void;
  isLocating: boolean;
}

/** 从 [lng, lat] 或 GeoJSON Point 解析坐标，确保 [lng, lat] 顺序 */
function parseLngLat(v: unknown): [number, number] {
  if (!v) return [0, 0];
  if (Array.isArray(v) && v.length >= 2) return ensureLngLat(Number(v[0]), Number(v[1]));
  const obj = v as { coordinates?: unknown[] };
  if (obj?.coordinates && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
    return ensureLngLat(Number(obj.coordinates[0]), Number(obj.coordinates[1]));
  }
  return [0, 0];
}

/** 根据 statusType 返回 Marker 徽章 HTML（空字符串表示无徽章） */
function getStatusBadgeHtml(statusType: string): string {
  switch (statusType) {
    case "CROWDED":
      return `<span class="poi-status-badge poi-status-crowded" title="人多拥挤">🔥</span>`;
    case "CONSTRUCTION":
      return `<span class="poi-status-badge poi-status-construction" title="施工绕行">🚧</span>`;
    case "CLOSED":
      return `<span class="poi-status-badge poi-status-closed" title="暂时关闭">🔒</span>`;
    default:
      return "";
  }
}

export const POIMap = forwardRef<POIMapRef, POIMapProps>(
  ({ school, pois, userLocation, onPOIClick, onMapBackgroundClick, onLocationUpdate, onLocatingChange, className = "w-full h-screen" }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const boundaryPolygonRef = useRef<any>(null); // 保留用于兼容（当前仅 CampusArea 有边界）
    const campusPolygonsRef = useRef<Map<string, any>>(new Map()); // 存储校区多边形实例
    const campusLabelsRef = useRef<Map<string, any>>(new Map()); // 存储校区标签实例
    const userMarkerRef = useRef<any>(null);
    const poiMarkersRef = useRef<any[]>([]);
    const markerClusterRef = useRef<any>(null);
    const highlightMarkerRef = useRef<any>(null);
    const walkingRef = useRef<any>(null);
    const ridingRef = useRef<any>(null);
    const routePolylineRef = useRef<any>(null);
    const startMarkerRef = useRef<any>(null);
    const endMarkerRef = useRef<any>(null);
    const pickStartMarkerRef = useRef<any>(null);
    const pickEndMarkerRef = useRef<any>(null);
    const searchIdRef = useRef(0); // 用于忽略过期的 search 回调（竞态防护）
    const geolocationRef = useRef<any>(null);
    const locateToastIdRef = useRef<string | undefined>(undefined);
    const hasInitialLocated = useRef(false); // 防止自动定位重复执行
    const zoomUpdateTimeoutRef = useRef<number | null>(null);
    // 使用 ref 存储回调函数，避免依赖项变化导致 handleLocate 重新创建
    const onLocationUpdateRef = useRef(onLocationUpdate);
    const onLocatingChangeRef = useRef(onLocatingChange);
    const onMapBackgroundClickRef = useRef(onMapBackgroundClick);

    // 同步更新 ref，确保始终使用最新的回调函数
    useEffect(() => {
      onLocationUpdateRef.current = onLocationUpdate;
      onLocatingChangeRef.current = onLocatingChange;
      onMapBackgroundClickRef.current = onMapBackgroundClick;
    }, [onLocationUpdate, onLocatingChange, onMapBackgroundClick]);

    const [isLocating, setIsLocating] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const [internalUserLocation, setInternalUserLocation] = useState<[number, number] | null>(null);
    const { amap, loading, error } = useAMap();
    const {
      isNavigating,
      startPoint,
      endPoint,
      routeInfo,
      navMode,
      stopNavigation,
      updateRouteInfo,
      setRouteSteps,
      selectMode,
    } = useNavigationStore();
    const {
      focusMapTrigger,
      focusCampusTrigger,
      focusCampusPayload,
      activeSchool,
      highlightSubPOI,
      setHighlightSubPOI,
      activePOI,
      selectedSubPOI,
      selectSubPOI,
      mapViewHistory,
      clearMapViewHistory,
      highlightedPoiId,
      setHighlightPoi,
    } = useSchoolStore();
    const selectedCategoryIds = useFilterStore((s) => s.selectedCategoryIds);

    // 定位处理函数
    // force: true 表示强制定位（用户点击按钮），false 表示自动定位（仅首次）
    const handleLocate = useCallback((force: boolean = false) => {
      if (!amap || !mapInstanceRef.current) {
        if (force) {
          toast.error("地图未加载完成，请稍后重试");
        }
        return;
      }

      // 检查定位插件是否已加载
      if (!amap.Geolocation) {
        if (force) {
          toast.error("定位服务不可用，请刷新页面重试");
        }
        return;
      }

      // 自动定位：如果已经执行过，不再重复
      if (!force && hasInitialLocated.current) {
        return;
      }

      setIsLocating(true);
      if (onLocatingChangeRef.current) {
        onLocatingChangeRef.current(true);
      }

      const toastId = toast.loading("定位中...");
      locateToastIdRef.current = toastId;

      // 如果定位实例不存在，创建新的
      if (!geolocationRef.current) {
        geolocationRef.current = new amap.Geolocation({
          enableHighAccuracy: true, // 高精度定位（GPS/高精度模式）
          timeout: 15000, // 超时 15 秒，给 GPS 更多搜星时间
          noIpLocate: 0, // 优先使用高精度定位，0 表示不禁用 IP 定位作为备选
          needAddress: false, // 减少解析地址的开销，提高响应速度
          convert: true, // 确保偏移量符合高德地图标准（GCJ-02）
          buttonPosition: "RB", // 隐藏高德默认按钮
          zoomToAccuracy: false, // 不自动调整视野，仅由「定位」按钮触发时手动 pan/zoom
          showButton: false, // 不显示定位按钮
          showMarker: false, // 不显示定位标记（我们用自己的蓝点）
          showCircle: true, // 显示定位精度圆圈，提示用户精度范围
          panToLocation: false, // 不自动平移，仅由「定位」按钮触发时手动 panTo
        });

        // 监听定位错误事件
        geolocationRef.current.on("error", (error: any) => {
          console.error("定位错误:", error);
          setIsLocating(false);
          if (onLocatingChangeRef.current) {
            onLocatingChangeRef.current(false);
          }
          toast.dismiss(locateToastIdRef.current);
          const errorMsg = error?.message || "定位失败";
          if (errorMsg.includes("Permission Denied") || errorMsg.includes("用户拒绝")) {
            toast.error("定位失败，请检查浏览器权限设置");
          } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
            toast.error("定位超时，请检查网络连接");
          } else if (errorMsg.includes("位置不可用") || errorMsg.includes("Position Unavailable")) {
            toast.error("无法获取位置信息，请检查设备定位功能");
          } else {
            toast.error("定位失败，请稍后重试");
          }
        });
      }

      // 获取当前位置
      geolocationRef.current.getCurrentPosition(
        (status: string, result: any) => {
          setIsLocating(false);
          if (onLocatingChangeRef.current) {
            onLocatingChangeRef.current(false);
          }

          // 标记已执行过自动定位
          if (!force) {
            hasInitialLocated.current = true;
          }

          if (status === "complete") {
            const { lng, lat } = result.position;
            const location: [number, number] = [lng, lat];
            setInternalUserLocation(location);
            if (onLocationUpdateRef.current) {
              onLocationUpdateRef.current(location);
            }
            // 仅当用户点击「定位」按钮时，平移并缩放到用户位置
            if (force && mapInstanceRef.current) {
              mapInstanceRef.current.setZoomAndCenter?.(17, [lng, lat], false, 400);
            }
            toast.success("定位成功", { id: toastId });
          } else {
            // 定位失败
            toast.dismiss(locateToastIdRef.current);
            const errorMsg = result?.message || "定位失败";
            if (errorMsg.includes("Permission Denied") || errorMsg.includes("用户拒绝")) {
              toast.error("定位失败，请检查浏览器权限设置");
            } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
              toast.error("定位超时，请检查网络连接");
            } else if (errorMsg.includes("位置不可用") || errorMsg.includes("Position Unavailable")) {
              toast.error("无法获取位置信息，请检查设备定位功能");
            } else {
              toast.error("定位失败，请稍后重试");
            }
          }
        }
      );
    }, [amap]); // 移除 onLocationUpdate 和 onLocatingChange 依赖，使用 ref 存储


    // 暴露定位函数给父组件（强制定位，无视锁）
    useImperativeHandle(ref, () => ({
      locate: () => handleLocate(true),
      isLocating,
    }), [handleLocate, isLocating]);

    // 使用内部定位或外部传入的定位
    const currentUserLocation = userLocation || internalUserLocation || undefined;

  // 初始化地图（仅创建一次，不随 school 变化重新创建）
  useEffect(() => {
    if (!amap || !mapRef.current || mapInstanceRef.current) {
      return;
    }

    // 确定地图中心点：必须使用学校几何中心，禁止使用用户位置
    // 优先 school.centerLat/centerLng，否则使用默认（校区加载后 drawCampuses 会 setFitView）
    const defaultCenter: [number, number] = [116.397428, 39.90923]; // 北京
    const center: [number, number] =
      school?.centerLng != null && school?.centerLat != null
        ? [school.centerLng, school.centerLat]
        : defaultCenter;

    // 创建地图实例
    // 修复：提高初始缩放级别，避免显示"世界地图"
    // 如果没有学校数据，使用 zoom: 15（而不是 13），这样即使没有学校也不会显示全球视图
    const map = new amap.Map(mapRef.current, {
      zoom: school ? 16 : 15, // 提高初始缩放级别
      center,
      viewMode: "3D",
      mapStyle: "amap://styles/normal",
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    // 地图加载完成：不自动定位，仅由「定位」按钮触发

    // LOD 阈值：Zoom 16
    // Zoom < 16: 校区标签显示，POI 标记隐藏
    // Zoom >= 16: 校区标签隐藏，POI 标记显示
    const ZOOM_LOD_THRESHOLD = 16;
    const updateZoomLevelAttr = () => {
      if (!mapRef.current || !mapInstanceRef.current) return;
      const currentZoom = mapInstanceRef.current.getZoom ? mapInstanceRef.current.getZoom() : 16;
      const level = currentZoom < ZOOM_LOD_THRESHOLD ? "low" : "high";
      mapRef.current.setAttribute("data-zoom-level", level);
      // Zoom < 16 时隐藏 MarkerCluster（含聚合气泡与单点）
      if (markerClusterRef.current) {
        markerClusterRef.current.setMap(currentZoom >= ZOOM_LOD_THRESHOLD ? mapInstanceRef.current : null);
      }
      // 无聚合时直接控制单点 Marker 显隐
      if (!markerClusterRef.current && poiMarkersRef.current.length > 0) {
        poiMarkersRef.current.forEach((m) => {
          m.setMap(currentZoom >= ZOOM_LOD_THRESHOLD ? mapInstanceRef.current : null);
        });
      }
    };

    // 使用简单的节流，避免缩放事件高频触发导致重复计算
    const handleZoomChange = () => {
      if (zoomUpdateTimeoutRef.current !== null) {
        window.clearTimeout(zoomUpdateTimeoutRef.current);
      }
      zoomUpdateTimeoutRef.current = window.setTimeout(() => {
        updateZoomLevelAttr();
      }, 100);
    };

    // 初始化时先设置一次
    updateZoomLevelAttr();

    // 监听缩放变化（节流处理）
    map.on("zoomend", handleZoomChange);
    map.on("zoomchange", handleZoomChange);

    // 地图点击：选点模式处理起点/终点；否则点击空白处清除 POI 选中状态
    const handleMapClick = (event: any) => {
      const currentMode = useNavigationStore.getState().selectMode;

      if (currentMode && event?.lnglat) {
        const point = {
          lng: event.lnglat.getLng(),
          lat: event.lnglat.getLat(),
          name: currentMode === "start" ? "自由选点(起点)" : "自由选点(终点)",
        };
        if (currentMode === "start") {
          analytics.nav.startSet({ source: "map_click" });
          useNavigationStore.getState().setStartPoint(point);
        } else if (currentMode === "end") {
          analytics.nav.endSet({ source: "map_click" });
          useNavigationStore.getState().setEndPoint(point);
        }
        useNavigationStore.getState().setSelectMode(null);
        return;
      }

      // 非选点模式：点击地图空白处，通知父组件关闭抽屉并清除选中（含视图恢复）
      if (!currentMode) {
        onMapBackgroundClickRef.current?.();
      }
    };

    map.on("click", handleMapClick);

    // 清理函数：仅在组件卸载或 amap 变化时清理
    return () => {
      setMapReady(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off("zoomend", handleZoomChange);
        mapInstanceRef.current.off("zoomchange", handleZoomChange);
        mapInstanceRef.current.off("click", handleMapClick);
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 amap 变化时初始化，加入 school 会导致地图重复创建与闪烁
  }, [amap]);

  // 选点模式下给地图容器增加地图钉光标，增强交互反馈
  useEffect(() => {
    if (!mapRef.current) return;

    if (selectMode) {
      mapRef.current.classList.add("cursor-map-pick");
    } else {
      mapRef.current.classList.remove("cursor-map-pick");
    }
  }, [selectMode]);

  // 校区列表状态
  const [campuses, setCampuses] = useState<CampusAreaItem[]>([]);

  // POI 实时状态映射（poiId -> statusType），用于 Marker 徽章展示
  const [poiStatusMap, setPoiStatusMap] = useState<Record<string, string>>({});

  // 加载校区列表（使用公开 API）
  // school 仅用于 school?.id，避免将 school 加入 deps 导致父组件重渲染时重复请求
  useEffect(() => {
    if (!school?.id) {
      setCampuses([]);
      return;
    }

    const fetchCampuses = async () => {
      try {
        const result = await getCampuses(school.id);
        if (result.success && result.data) {
          setCampuses(result.data);
        }
      } catch (error) {
        console.error("加载校区列表失败:", error);
      }
    };

    fetchCampuses();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- school?.id 足够，避免 school 引用变化触发重复请求
  }, [school?.id]);

  // 加载学校下所有有效实时状态，构建 poiId -> statusType 映射
  // 优先级：CROWDED > CONSTRUCTION > CLOSED > 其他
  useEffect(() => {
    if (!school?.id) {
      setPoiStatusMap({});
      return;
    }

    const fetchLiveStatuses = async () => {
      const result = await getActiveStatusesBySchool(school.id);
      if (!result.success || !result.data) return;

      const priority: Record<string, number> = {
        CROWDED: 3,
        CONSTRUCTION: 2,
        CLOSED: 1,
      };
      const map: Record<string, string> = {};

      for (const s of result.data) {
        const curr = map[s.poiId];
        const currP = curr ? (priority[curr] ?? 0) : 0;
        const newP = priority[s.statusType] ?? 0;
        if (newP >= currP) {
          map[s.poiId] = s.statusType;
        }
      }
      setPoiStatusMap(map);
    };

    fetchLiveStatuses();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- school?.id 足够，避免 school 引用变化触发重复请求
  }, [school?.id]);

  // 绘制多校区边界和标签
  const drawCampuses = useCallback(() => {
    if (!amap || !mapInstanceRef.current || !school) {
      return;
    }

    // 清除旧的校区多边形和标签
    campusPolygonsRef.current.forEach((polygon) => {
      try {
        mapInstanceRef.current.remove(polygon);
      } catch (error) {
        console.warn("移除校区多边形失败:", error);
      }
    });
    campusPolygonsRef.current.clear();

    campusLabelsRef.current.forEach((label) => {
      try {
        mapInstanceRef.current.remove(label);
      } catch (error) {
        console.warn("移除校区标签失败:", error);
      }
    });
    campusLabelsRef.current.clear();

    // 如果有校区数据，优先使用校区数据
    if (campuses.length > 0) {
      campuses.forEach((campus) => {
        // 解析边界数据
        let boundary = campus.boundary;
        if (typeof boundary === "string") {
          try {
            boundary = JSON.parse(boundary);
          } catch (error) {
            console.error("解析校区边界失败:", error);
            return;
          }
        }

        const b = boundary as { type?: string; coordinates?: unknown[][] } | null;
        if (!b || b.type !== "Polygon") {
          return;
        }

        const coordinates = b.coordinates?.[0];
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
          return;
        }

        // 创建校区多边形（主题色）
        const polygon = new amap.Polygon({
          path: coordinates,
          fillColor: "#FF4500",
          fillOpacity: 0.08,
          strokeColor: "#FF4500",
          strokeWeight: 2,
          strokeOpacity: 0.5,
          strokeDasharray: [10, 5],
          zIndex: 10,
        });

        polygon.setMap(mapInstanceRef.current);
        campusPolygonsRef.current.set(campus.id, polygon);

        // 校区 Polygon 会拦截地图点击，需在选点模式下转发点击逻辑（自由选点）
        polygon.on("click", (e: any) => {
          const navState = useNavigationStore.getState();
          const currentMode = navState.selectMode;
          if (currentMode && e?.lnglat) {
            const lng = typeof e.lnglat.getLng === "function" ? e.lnglat.getLng() : e.lnglat.lng;
            const lat = typeof e.lnglat.getLat === "function" ? e.lnglat.getLat() : e.lnglat.lat;
            const point = {
              lng,
              lat,
              name: currentMode === "start" ? "自由选点(起点)" : "自由选点(终点)",
            };
            if (currentMode === "start") {
              analytics.nav.startSet({ source: "map_click" });
              navState.setStartPoint(point);
            } else {
              analytics.nav.endSet({ source: "map_click" });
              navState.setEndPoint(point);
            }
            navState.setSelectMode(null);
          }
        });

        // 创建校区标签：优先使用 labelCenter（polylabel），否则用 center
        const labelPos = campus.labelCenter ?? campus.center;
        const [centerLng, centerLat] = parseLngLat(labelPos);
        const text = new amap.Text({
          text: campus.name,
          position: [centerLng, centerLat],
          anchor: "center",
          style: {
            fontSize: "14px",
            fontWeight: "bold",
            color: "#FF4500",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid #FF4500",
          },
          zIndex: 20,
        });

        text.setMap(mapInstanceRef.current);
        campusLabelsRef.current.set(campus.id, text);
      });

      // LOD：Zoom < 15 时显示校区标签，Zoom >= 15 时隐藏
      const updateLabelVisibility = () => {
        if (!mapInstanceRef.current) return;
        
        const zoom = mapInstanceRef.current.getZoom();
        const shouldShow = zoom < 15;
        
        campusLabelsRef.current.forEach((label) => {
          // 高德地图 Text 使用 show() 和 hide() 方法，而不是 setVisible()
          if (label && typeof label.show === 'function' && typeof label.hide === 'function') {
            if (shouldShow) {
              label.show();
            } else {
              label.hide();
            }
          } else {
            // 如果 show/hide 方法不存在，使用 setMap 方法控制可见性
            if (label && typeof label.setMap === 'function') {
              label.setMap(shouldShow ? mapInstanceRef.current : null);
            }
          }
        });
      };

      mapInstanceRef.current.on("zoomend", updateLabelVisibility);
      updateLabelVisibility();

      // 使用所有校区多边形进行 fitView，或学校无 center 时用首校区多边形几何中心
      const polygons = Array.from(campusPolygonsRef.current.values());
      const schoolCenterOk = school.centerLng != null && school.centerLat != null;

      if (polygons.length > 0) {
        if (schoolCenterOk) {
          try {
            mapInstanceRef.current.setFitView(polygons, false, [60, 60, 60, 60], 17);
          } catch (error) {
            console.warn("setFitView 失败，使用 setZoomAndCenter:", error);
            mapInstanceRef.current.setZoomAndCenter(16, [school.centerLng!, school.centerLat!]);
          }
        } else {
          // Fallback: 从首校区多边形计算几何中心
          const first = campuses[0];
          let boundary = first.boundary;
          if (typeof boundary === "string") {
            try {
              boundary = JSON.parse(boundary);
            } catch {
              boundary = null;
            }
          }
          if (boundary && (boundary as { type?: string }).type === "Polygon") {
            const coords = (boundary as { coordinates?: number[][][] }).coordinates;
            if (coords?.[0]?.length) {
              try {
                const poly = polygon(coords);
                const centerFeature = centroid(poly);
                const [lng, lat] = centerFeature.geometry.coordinates;
                mapInstanceRef.current.setZoomAndCenter(16, [lng, lat], false, 400);
              } catch (e) {
                console.warn("centroid 计算失败，使用 setFitView:", e);
                mapInstanceRef.current.setFitView(polygons, false, [60, 60, 60, 60], 16);
              }
            } else {
              mapInstanceRef.current.setFitView(polygons, false, [60, 60, 60, 60], 16);
            }
          } else {
            mapInstanceRef.current.setFitView(polygons, false, [60, 60, 60, 60], 16);
          }
        }
      }
    } else {
      // 无校区数据：仅使用学校 center 聚焦（若有）
      if (school.centerLng != null && school.centerLat != null) {
        mapInstanceRef.current.setZoomAndCenter(16, [school.centerLng, school.centerLat]);
      }
    }
  }, [amap, school, campuses]);

  // 绘制校区边界和标签（当地图和学校数据都准备好时）
  useEffect(() => {
    // 确保地图实例已创建
    if (!amap || !mapInstanceRef.current) {
      return;
    }

    // 如果学校数据未准备好，清理旧边界
    if (!school) {
      // 清理校区多边形和标签
      campusPolygonsRef.current.forEach((polygon) => {
        try {
          mapInstanceRef.current.remove(polygon);
        } catch (error) {
          console.warn("清理校区多边形失败:", error);
        }
      });
      campusPolygonsRef.current.clear();

      campusLabelsRef.current.forEach((label) => {
        try {
          mapInstanceRef.current.remove(label);
        } catch (error) {
          console.warn("清理校区标签失败:", error);
        }
      });
      campusLabelsRef.current.clear();

      // 清理旧边界
      if (boundaryPolygonRef.current) {
        try {
          mapInstanceRef.current.remove(boundaryPolygonRef.current);
          boundaryPolygonRef.current = null;
        } catch (error) {
          console.warn("清理边界多边形失败:", error);
        }
      }
      return;
    }

    // 延迟绘制，确保地图完全渲染
    const timer = setTimeout(() => {
      drawCampuses();
    }, 100);

    // 清理函数
    return () => {
      clearTimeout(timer);
    };
  }, [amap, school, drawCampuses]);

  // 监听 school 变化，强制聚焦到学校（新增：修复地图显示世界地图的 Bug）
  useEffect(() => {
    if (!mapInstanceRef.current || !school) {
      return;
    }

    // 验证中心点坐标有效性
    const isValidCenter = school.centerLng != null && school.centerLat != null &&
                          !isNaN(school.centerLng) && !isNaN(school.centerLat) &&
                          school.centerLng >= 73 && school.centerLng <= 135 &&
                          school.centerLat >= 3 && school.centerLat <= 54;

    if (!isValidCenter) {
      return;
    }

    // 如果边界多边形已绘制，优先使用 setFitView
    if (boundaryPolygonRef.current) {
      try {
        mapInstanceRef.current.setFitView([boundaryPolygonRef.current], false, [60, 60, 60, 60], 17);
      } catch (error) {
        mapInstanceRef.current.setZoomAndCenter(17, [school.centerLng!, school.centerLat!]);
      }
    } else {
      mapInstanceRef.current.setZoomAndCenter(17, [school.centerLng!, school.centerLat!]);
    }
  }, [school]);

  // 响应 Navbar 点击学校名称：平移并缩放到 activeSchool 中心（与 Navbar 显示的学校一致）
  // 当学校 centerLng/centerLat 为 null 时，使用校区中心作为回退（学校表中心可选，校区必有 center）
  useEffect(() => {
    const school = activeSchool;
    const schoolCenterOk = school != null && school.centerLng != null && school.centerLat != null;
    const rawCenter = campuses.length > 0 ? campuses[0].center : null;
    const campusCenter: [number, number] | null = (() => {
      if (!rawCenter) return null;
      if (Array.isArray(rawCenter) && rawCenter.length >= 2)
        return [Number(rawCenter[0]), Number(rawCenter[1])];
      const c = rawCenter as { coordinates?: number[] };
      if (c?.coordinates && Array.isArray(c.coordinates) && c.coordinates.length >= 2)
        return [Number(c.coordinates[0]), Number(c.coordinates[1])];
      return null;
    })();
    const center: [number, number] | null = schoolCenterOk
      ? [school!.centerLng!, school!.centerLat!]
      : campusCenter && !isNaN(campusCenter[0]) && !isNaN(campusCenter[1])
        ? campusCenter
        : null;
    if (focusMapTrigger <= 0 || !school || !center || !mapInstanceRef.current) {
      return;
    }
    // setZoomAndCenter(zoom, center, immediately?, duration?)
    mapInstanceRef.current.setZoomAndCenter(16, center, false, 600);
  }, [focusMapTrigger, activeSchool, mapReady, campuses]);

  // 响应校区选择：平移到指定校区中心
  useEffect(() => {
    if (focusCampusTrigger <= 0 || !focusCampusPayload || !mapInstanceRef.current || !amap) {
      return;
    }
    const { center, boundary } = focusCampusPayload;
    const centerArr: [number, number] = Array.isArray(center)
      ? [Number(center[0]), Number(center[1])]
      : [Number((center as { coordinates?: number[] })?.coordinates?.[0] ?? 0), Number((center as { coordinates?: number[] })?.coordinates?.[1] ?? 0)];
    if (isNaN(centerArr[0]) || isNaN(centerArr[1])) return;

    if (boundary?.type === "Polygon" && boundary.coordinates?.[0]?.length) {
      try {
        const path = boundary.coordinates[0].map((c: number[]) => [c[0], c[1]]);
        const polygon = new amap.Polygon({
          path,
          strokeColor: "transparent",
          fillColor: "transparent",
        });
        polygon.setMap(mapInstanceRef.current);
        mapInstanceRef.current.setFitView([polygon], false, [60, 60, 60, 60], 16);
        polygon.setMap(null);
      } catch {
        mapInstanceRef.current.setZoomAndCenter(16, centerArr, false, 600);
      }
    } else {
      mapInstanceRef.current.setZoomAndCenter(16, centerArr, false, 600);
    }
  }, [focusCampusTrigger, focusCampusPayload, amap]);

    // 显示用户位置标记（蓝色脉动圆点）
    useEffect(() => {
      if (!amap || !mapInstanceRef.current || !currentUserLocation) {
        // 如果没有用户位置，移除标记
        if (userMarkerRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.remove(userMarkerRef.current);
          userMarkerRef.current = null;
        }
        return;
      }

    // 移除旧的用户位置标记
    if (userMarkerRef.current) {
      mapInstanceRef.current.remove(userMarkerRef.current);
    }

    // 创建用户位置标记（蓝色脉动圆点）
    const pulseMarkerContent = `
      <div style="
        position: relative;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- 外层脉动圆环 -->
        <div style="
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: #1890ff;
          opacity: 0.3;
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        "></div>
        <!-- 中层脉动圆环 -->
        <div style="
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background-color: #1890ff;
          opacity: 0.5;
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: 0.5s;
        "></div>
        <!-- 核心圆点 -->
        <div style="
          position: relative;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #1890ff;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(24, 144, 255, 0.5);
          z-index: 10;
        "></div>
        <style>
          @keyframes pulse-ring {
            0% {
              transform: scale(0.8);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.2);
              opacity: 0.1;
            }
            100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }
        </style>
      </div>
    `;

      userMarkerRef.current = new amap.Marker({
        position: currentUserLocation,
        content: pulseMarkerContent,
        anchor: "center",
        offset: new amap.Pixel(0, 0),
        zIndex: 1000, // 确保用户位置标记在最上层
      });

      userMarkerRef.current.setMap(mapInstanceRef.current);

      // 不自动平移地图到用户位置，仅由「定位」按钮触发

    // 清理函数
    return () => {
      if (userMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(userMarkerRef.current);
        userMarkerRef.current = null;
      }
    };
  }, [amap, currentUserLocation, school]);

    // 显示 POI 标记（支持 Marker 聚合 + 分类筛选）
    // 正常状态：仅根 POI；activePOI 选中时：根 POI + 该父 POI 的子 POI
    const rootVisiblePois = useMemo(() => {
      const visible = selectedCategoryIds.length === 0
        ? pois
        : pois.filter((poi) =>
            selectedCategoryIds.includes((poi as POIWithStatus & { categoryId?: string | null }).categoryId ?? "")
          );
      const roots = visible.filter((p) => !p.parentId && p.schoolId === school?.id);
      if (!activePOI) return roots;
      const children = visible.filter((p) => p.parentId === activePOI.id);
      return [...roots, ...children];
    }, [pois, selectedCategoryIds, school?.id, activePOI]);

  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !school) {
      return;
    }

    const createMarkerForPoi = (poi: POIWithStatus) => {
      const liveStatusType = poiStatusMap[poi.id];
      const statusBadgeHtml = liveStatusType ? getStatusBadgeHtml(liveStatusType) : "";
      const isHighlighted = highlightedPoiId === poi.id;
      const isSelected = activePOI?.id === poi.id || selectedSubPOI?.id === poi.id;
      const highlightPulseHtml = isHighlighted
        ? '<div class="poi-highlight-pulse" style="position:absolute;left:2px;top:2px;width:20px;height:20px;background:var(--primary-theme-pulse);border-radius:50%;animation:poi-marker-pulse 1.5s infinite;pointer-events:none;z-index:10;"></div>'
        : "";
      const selectedClass = isSelected ? " selected" : "";
      const markerContent = `
        <div class="poi-marker-wrapper" style="position:relative;width:24px;height:24px;overflow:visible;">
          <div class="flat-marker${selectedClass}">
            <div class="marker-halo"></div>
            <div class="marker-inner"></div>
          </div>
          ${statusBadgeHtml}
          ${highlightPulseHtml}
        </div>
        <style>
          [data-zoom-level="high"] .poi-marker-wrapper { transform: scale(1); opacity: 1; pointer-events: auto; }
          [data-zoom-level="low"] .poi-marker-wrapper { opacity: 0; pointer-events: none; transform: scale(0.6); }
          .poi-marker-wrapper .poi-status-badge { position: absolute; top: -6px; right: -6px; font-size: 12px; line-height: 1; z-index: 2; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }
          .poi-status-crowded { animation: poi-badge-pulse 1.5s ease-in-out infinite; }
          @keyframes poi-badge-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.9; } }
          @keyframes poi-marker-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
        </style>
      `;
      const marker = new amap.Marker({
        position: [poi.lng, poi.lat],
        content: markerContent,
        offset: new amap.Pixel(-12, -12),
        title: poi.name,
        extData: { poi },
      });
      marker.on("click", () => {
        const navState = useNavigationStore.getState();
        const mode = navState.selectMode;
        if (mode === "start") {
          analytics.nav.startSet({ source: "map_marker", poi_id: poi.id });
          navState.setStartPoint({ lng: poi.lng, lat: poi.lat, name: poi.name });
          navState.setSelectMode(null);
          return;
        }
        if (mode === "end") {
          analytics.nav.endSet({ source: "map_marker", poi_id: poi.id });
          navState.setEndPoint({ lng: poi.lng, lat: poi.lat, name: poi.name });
          navState.setSelectMode(null);
          return;
        }
        if (poi.parentId) {
          selectSubPOI(poi);
        } else if (onPOIClick) {
          const map = mapInstanceRef.current;
          const center = map?.getCenter?.();
          const zoom = map?.getZoom?.();
          const view: MapViewState | null =
            center && typeof zoom === "number"
              ? { center: [center.getLng(), center.getLat()], zoom }
              : null;
          onPOIClick(poi, view);
        }
      });
      return marker;
    };

    // 销毁旧 Marker 实例，防止内存泄漏
    const destroyOldMarkers = () => {
      poiMarkersRef.current.forEach((marker) => {
        marker.setMap(null);
      });
      poiMarkersRef.current = [];
    };

    if (markerClusterRef.current) {
      // 已有聚合实例：清空并更新，避免重新创建
      markerClusterRef.current.clearMarkers();
      destroyOldMarkers();

      const newMarkers = rootVisiblePois.map((poi) => createMarkerForPoi(poi));
      poiMarkersRef.current = newMarkers;

      if (newMarkers.length > 0) {
        markerClusterRef.current.addMarkers(newMarkers);
      }
    } else {
      // 首次创建：销毁可能残留的旧标记，创建新标记与聚合
      destroyOldMarkers();

      rootVisiblePois.forEach((poi) => {
        poiMarkersRef.current.push(createMarkerForPoi(poi));
      });

      if ((amap as any).MarkerCluster && poiMarkersRef.current.length > 0) {
        markerClusterRef.current = new (amap as any).MarkerCluster(
          mapInstanceRef.current,
          poiMarkersRef.current,
          { gridSize: 80, maxZoom: 17 }
        );
        // LOD: 初始根据当前 zoom 决定是否显示
        const zoom = mapInstanceRef.current?.getZoom?.() ?? 15;
        if (zoom < 15) {
          markerClusterRef.current.setMap(null);
        }
      } else if (poiMarkersRef.current.length > 0) {
        const zoom = mapInstanceRef.current?.getZoom?.() ?? 15;
        if (zoom >= 15) {
          poiMarkersRef.current.forEach((marker) => marker.setMap(mapInstanceRef.current));
        }
      }
    }

    return () => {
      if (markerClusterRef.current) {
        markerClusterRef.current.clearMarkers();
        markerClusterRef.current.setMap(null);
        markerClusterRef.current = null;
      }
      destroyOldMarkers();
    };
  }, [amap, school, rootVisiblePois, poiStatusMap, onPOIClick, selectSubPOI, highlightedPoiId, activePOI, selectedSubPOI]);

  // activePOI 选中时：FitView 到父 POI + 所有子 POI
  // school 仅用于存在性检查，school?.id 足够；避免 school 引用变化导致地图闪烁
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !activePOI || !school) return;

    const children = pois.filter((p) => p.parentId === activePOI.id);
    const pointsToFit = [activePOI, ...children];
    if (pointsToFit.length === 0) return;

    const tempMarkers = pointsToFit.map(
      (p) => new amap.Marker({ position: [p.lng, p.lat], map: null })
    );
    try {
      mapInstanceRef.current.setFitView(tempMarkers, false, [60, 60, 60, 60]);
    } catch (e) {
      console.warn("setFitView 失败:", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- school?.id 足够，避免 school 引用变化触发地图重绘
  }, [amap, activePOI, pois, school?.id]);

  // activePOI 清除时：恢复 mapViewHistory 中的视图
  useEffect(() => {
    if (!mapInstanceRef.current || activePOI !== null || !mapViewHistory) return;

    try {
      mapInstanceRef.current.setZoomAndCenter(
        mapViewHistory.zoom,
        mapViewHistory.center,
        false,
        400
      );
    } catch (e) {
      console.warn("恢复地图视图失败:", e);
    }
    clearMapViewHistory();
  }, [activePOI, mapViewHistory, clearMapViewHistory]);

  // 临时高亮子 POI（「在地图中查看」）
  useEffect(() => {
    if (!amap || !mapInstanceRef.current) return;

    if (highlightMarkerRef.current) {
      mapInstanceRef.current.remove(highlightMarkerRef.current);
      highlightMarkerRef.current = null;
    }

    if (highlightSubPOI) {
      const content = `
        <div style="position:relative;width:24px;height:24px;overflow:visible;">
          <div class="sub-poi-pulse" style="position:absolute;left:2px;top:2px;width:20px;height:20px;background:var(--primary-theme-pulse);border-radius:50%;animation:poi-marker-pulse 1.5s infinite;pointer-events:none;z-index:10;"></div>
          <div style="position:absolute;left:6px;top:6px;width:12px;height:12px;background:#FF4500;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(255,69,0,0.6);z-index:11;"></div>
        </div>
        <style>
          @keyframes poi-marker-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
        </style>
      `;
      const marker = new amap.Marker({
        position: [highlightSubPOI.lng, highlightSubPOI.lat],
        title: highlightSubPOI.name,
        content,
        offset: new amap.Pixel(-12, -12),
        zIndex: 500,
      });
      marker.setMap(mapInstanceRef.current);
      highlightMarkerRef.current = marker;

      mapInstanceRef.current.panTo([highlightSubPOI.lng, highlightSubPOI.lat], false, 300);
      mapInstanceRef.current.setZoom(18);

      const timer = setTimeout(() => {
        setHighlightSubPOI(null);
      }, 5000);

      return () => {
        clearTimeout(timer);
        if (highlightMarkerRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.remove(highlightMarkerRef.current);
          highlightMarkerRef.current = null;
        }
      };
    }
  }, [amap, highlightSubPOI, setHighlightSubPOI]);

  // 响应 highlightedPoiId（集市商品选中、R07 脉动）：平移到 POI 并触发 5 秒脉动
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !highlightedPoiId || !pois.length) return;

    const poi = pois.find((p) => p.id === highlightedPoiId);
    if (!poi) return;

    mapInstanceRef.current.panTo([poi.lng, poi.lat], false, 400);
    // 子 POI 放大更近，便于查看具体入口等
    mapInstanceRef.current.setZoom(poi.parentId ? 18 : 17);

    const timer = setTimeout(() => {
      setHighlightPoi(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [amap, highlightedPoiId, pois, setHighlightPoi]);

  // 选点后立即在坐标显示起点/终点标记（无路线时；有路线后由导航 effect 绘制）
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || routeInfo) return;

    const map = mapInstanceRef.current;
    const toRemove: any[] = [];

    if (startPoint) {
      if (pickStartMarkerRef.current) {
        toRemove.push(pickStartMarkerRef.current);
      }
      const m = new amap.Marker({
        position: [startPoint.lng, startPoint.lat],
        content:
          '<div style="width:24px;height:24px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        offset: new amap.Pixel(-12, -12),
        zIndex: 90,
      });
      m.setMap(map);
      pickStartMarkerRef.current = m;
    } else if (pickStartMarkerRef.current) {
      toRemove.push(pickStartMarkerRef.current);
      pickStartMarkerRef.current = null;
    }

    if (endPoint) {
      if (pickEndMarkerRef.current) {
        toRemove.push(pickEndMarkerRef.current);
      }
      const m = new amap.Marker({
        position: [endPoint.lng, endPoint.lat],
        content:
          '<div style="width:24px;height:24px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        offset: new amap.Pixel(-12, -12),
        zIndex: 90,
      });
      m.setMap(map);
      pickEndMarkerRef.current = m;
    } else if (pickEndMarkerRef.current) {
      toRemove.push(pickEndMarkerRef.current);
      pickEndMarkerRef.current = null;
    }

    toRemove.forEach((obj) => {
      try {
        map.remove(obj);
      } catch (e) {
        console.warn("清除选点标记失败:", e);
      }
    });

    return () => {
      if (pickStartMarkerRef.current && map) {
        try {
          map.remove(pickStartMarkerRef.current);
        } catch {}
        pickStartMarkerRef.current = null;
      }
      if (pickEndMarkerRef.current && map) {
        try {
          map.remove(pickEndMarkerRef.current);
        } catch {}
        pickEndMarkerRef.current = null;
      }
    };
  }, [amap, startPoint, endPoint, routeInfo]);

  // 清除导航覆盖物（路径线、起点/终点标记、选点预览标记）
  const clearNavigationOverlay = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const toRemove: any[] = [];
    if (routePolylineRef.current) {
      toRemove.push(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (startMarkerRef.current) {
      toRemove.push(startMarkerRef.current);
      startMarkerRef.current = null;
    }
    if (endMarkerRef.current) {
      toRemove.push(endMarkerRef.current);
      endMarkerRef.current = null;
    }
    if (pickStartMarkerRef.current) {
      toRemove.push(pickStartMarkerRef.current);
      pickStartMarkerRef.current = null;
    }
    if (pickEndMarkerRef.current) {
      toRemove.push(pickEndMarkerRef.current);
      pickEndMarkerRef.current = null;
    }
    toRemove.forEach((obj) => {
      try {
        map.remove(obj);
      } catch (e) {
        console.warn("清除导航覆盖物失败:", e);
      }
    });
    if (walkingRef.current) {
      walkingRef.current = null;
    }
    if (ridingRef.current) {
      ridingRef.current = null;
    }
  }, []);

  // 导航功能：开始导航（基于 startPoint 和 endPoint）
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !isNavigating || !startPoint || !endPoint) {
      return;
    }

    const startNav = async () => {
      try {
        // 立即清除旧路线和标记，避免重叠
        clearNavigationOverlay();

        // 先检查起点和终点是否在高德服务范围（中国境内 GCJ-02）
        const startValid = CoordinateConverter.isValidGCJ02(startPoint.lng, startPoint.lat);
        const endValid = CoordinateConverter.isValidGCJ02(endPoint.lng, endPoint.lat);

        if (!startValid || !endValid) {
          console.warn("导航起点或终点不在高德地图服务范围内，无法规划路线。", {
            startPoint,
            endPoint,
          });
          toast.error("当前起点或终点不在支持范围内，暂不提供导航服务。");
          stopNavigation();
          return;
        }

        const isRide = navMode === "ride";
        const PluginClass = isRide ? amap.Riding : amap.Walking;
        const pluginName = isRide ? "AMap.Riding" : "AMap.Walking";

        if (!PluginClass) {
          console.error(`${pluginName} 插件未加载`);
          toast.error("导航服务加载失败，请稍后重试。");
          stopNavigation();
          return;
        }

        // 不传入 map，插件仅返回数据不绘制，避免无法清除的覆盖物残留
        const planner = new PluginClass({ hideMarkers: true });
        if (isRide) {
          ridingRef.current = planner;
          walkingRef.current = null;
        } else {
          walkingRef.current = planner;
          ridingRef.current = null;
        }

        // 每次 search 前清除插件内部残留覆盖物，防止泄漏
        if (typeof planner.clear === "function") {
          try {
            planner.clear();
          } catch (_) {}
        }

        // 递增 searchId，用于回调中忽略过期结果（竞态防护）
        const currentSearchId = ++searchIdRef.current;

        // 搜索路径（仅获取坐标数据，由我们手动绘制 Polyline）
        planner.search(
          [startPoint.lng, startPoint.lat], // 起点
          [endPoint.lng, endPoint.lat], // 终点
          (status: string, result: any) => {
            // 忽略过期的 search 回调，防止旧路线覆盖新路线
            if (currentSearchId !== searchIdRef.current) return;
              if (status === "complete") {
              // 再次清除（防止竞态：旧回调晚于新 startNav 的 clear 执行）
              clearNavigationOverlay();
              // 路径规划成功
              if (!result.routes || result.routes.length === 0) {
                analytics.nav.routePlanFail({ error_reason: "no_routes" });
                stopNavigation();
                return;
              }
              const route = result.routes[0];
                const distance = route.distance; // 距离（米）
                const duration = Math.round(route.time / 60); // 时间（分钟）

                // Riding 使用 rides，Walking 使用 steps
                const stepsArray = route.rides ?? route.steps ?? [];

                // 提取路径点（兼容 AMap 1.4/2.0 多种格式：path 数组、polyline 字符串、LngLat 对象）
                const path: [number, number][] = [];
                const stepsSummary: { instruction: string; distance: number }[] = [];

                const parsePoint = (point: any): [number, number] | null => {
                  if (Array.isArray(point) && point.length >= 2) {
                    return [Number(point[0]), Number(point[1])];
                  }
                  if (point && typeof point.getLng === "function" && typeof point.getLat === "function") {
                    return [point.getLng(), point.getLat()];
                  }
                  if (point && typeof point.lng === "number" && typeof point.lat === "number") {
                    return [point.lng, point.lat];
                  }
                  return null;
                };

                stepsArray.forEach((step: any) => {
                  if (step.path && Array.isArray(step.path)) {
                    step.path.forEach((point: any) => {
                      const p = parsePoint(point);
                      if (p) path.push(p);
                    });
                  }
                  // AMap 2.0 可能使用 polyline 字符串: "lng,lat;lng,lat;..."
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
                    stepsSummary.push({
                      instruction: step.instruction,
                      distance: step.distance ?? 0,
                    });
                  }
                });

                // 更新导航信息与步骤
                updateRouteInfo({
                  distance,
                  duration,
                  path,
                });
                setRouteSteps(stepsSummary);
                analytics.nav.routePlanSuccess({ distance_m: distance, duration_s: duration * 60, nav_mode: navMode });

                // 无有效路径点则不绘制（避免空 Polyline）
                if (path.length < 2) {
                  return;
                }

                // 手动绘制路径折线（完全可控，便于清理；骑行用蓝色区分）
                const strokeColor = isRide ? "#0079D3" : "#FF4500";
                const polyline = new amap.Polyline({
                  path: path,
                  strokeColor,
                  strokeOpacity: 1,
                  strokeWeight: 6,
                  strokeStyle: "solid",
                  lineJoin: "round",
                  lineCap: "round",
                  showDir: true,
                  zIndex: 50,
                });

                routePolylineRef.current = polyline;
                polyline.setMap(mapInstanceRef.current);

                // 创建起点/终点标记（便于清理，与 clearNavigationOverlay 配合）
                const startMarker = new amap.Marker({
                  position: [startPoint.lng, startPoint.lat],
                  content: '<div style="width:24px;height:24px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
                  offset: new amap.Pixel(-12, -12),
                  zIndex: 100,
                });
                startMarker.setMap(mapInstanceRef.current);
                startMarkerRef.current = startMarker;

                const endMarker = new amap.Marker({
                  position: [endPoint.lng, endPoint.lat],
                  content: '<div style="width:24px;height:24px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
                  offset: new amap.Pixel(-12, -12),
                  zIndex: 100,
                });
                endMarker.setMap(mapInstanceRef.current);
                endMarkerRef.current = endMarker;

                // 自动适配视野，使整条路线与起终点均可见（含 padding，限制最大缩放避免过远）
                try {
                  mapInstanceRef.current.setFitView(
                    [polyline, startMarker, endMarker],
                    false,
                    [50, 50, 50, 50],
                    18
                  );
                } catch (e) {
                  console.warn("setFitView 失败，使用 panTo 回退:", e);
                  mapInstanceRef.current.panTo([endPoint.lng, endPoint.lat]);
                }
            } else if (status === "error") {
              if (currentSearchId !== searchIdRef.current) return;
              console.error("路径规划失败:", result);
              analytics.nav.routePlanFail({
                error_reason: result?.info === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : (result?.message ?? "unknown"),
                nav_mode: navMode,
              });

              if (result && result.info === "OUT_OF_SERVICE") {
                toast.error(`当前区域暂不支持${isRide ? "骑行" : "步行"}导航服务。`);
              } else {
                toast.error("路径规划失败，请稍后重试。");
              }

              stopNavigation();
            }
          }
        );
      } catch (error) {
        console.error("导航功能初始化失败:", error);
        toast.error("导航初始化失败，请稍后重试。");
        stopNavigation();
      }
    };

    startNav();

    // 清理函数
    return () => {
      clearNavigationOverlay();
    };
  }, [amap, isNavigating, navMode, startPoint, endPoint, updateRouteInfo, setRouteSteps, stopNavigation, clearNavigationOverlay]);

  // 停止导航时清除所有覆盖物
  useEffect(() => {
    if (!isNavigating) {
      clearNavigationOverlay();
    }
  }, [isNavigating, clearNavigationOverlay]);

    if (loading) {
      return (
        <div className={`${className} flex items-center justify-center bg-gray-100`}>
          <div className="text-center">
            <div className="mb-4 text-lg font-medium text-gray-700">加载地图中...</div>
            <div className="h-2 w-64 rounded-full bg-gray-200">
              <div className="h-2 animate-pulse rounded-full bg-[#FF4500]"></div>
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className={`${className} flex items-center justify-center bg-red-50`}>
          <div className="text-center">
            <p className="text-lg font-medium text-red-600">地图加载失败</p>
            <p className="mt-2 text-sm text-red-500">{error.message}</p>
          </div>
        </div>
      );
    }

    return <div ref={mapRef} className={className} />;
  }
);

POIMap.displayName = "POIMap";

