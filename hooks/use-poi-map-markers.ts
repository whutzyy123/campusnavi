/**
 * POI 地图标记 Hook
 * 负责 POI 标记创建、聚合管理和点击事件处理
 */

import { useEffect, useState, useMemo } from "react";
import { useSchoolStore, type MapViewState } from "@/store/use-school-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useFilterStore } from "@/store/use-filter-store";
import { getActiveStatusesBySchool } from "@/lib/actions/status";
import { buildPOIMarkerContent, MARKER_CLUSTER_OPTIONS, FIT_VIEW_PADDING } from "@/lib/poi-map";
import { analytics } from "@/lib/analytics";
import type { School } from "@/store/use-school-store";
import type { POIWithStatus } from "@/lib/geo/poi-utils";

export interface UsePOIMapMarkersOptions {
  amap: any;
  mapInstanceRef: React.MutableRefObject<any>;
  mapReady: boolean;
  school: School | null;
  pois: POIWithStatus[];
  onPOIClick?: (poi: POIWithStatus, view?: MapViewState | null) => void;
  poiMarkersRef: React.MutableRefObject<any[]>;
  markerClusterRef: React.MutableRefObject<any>;
}

export function usePOIMapMarkers(options: UsePOIMapMarkersOptions): void {
  const {
    amap,
    mapInstanceRef,
    mapReady,
    school,
    pois,
    onPOIClick,
    poiMarkersRef,
    markerClusterRef,
  } = options;

  const [poiStatusMap, setPoiStatusMap] = useState<Record<string, string>>({});

  const {
    activePOI,
    selectedSubPOI,
    selectSubPOI,
    highlightedPoiId,
    mapViewHistory,
    clearMapViewHistory,
  } = useSchoolStore();

  const selectedCategoryIds = useFilterStore((s) => s.selectedCategoryIds);

  // 加载 POI 实时状态
  useEffect(() => {
    if (!school?.id) {
      setPoiStatusMap({});
      return;
    }

    const fetchLiveStatuses = async () => {
      const result = await getActiveStatusesBySchool(school.id);
      if (!result.success || !result.data) return;

      const priority: Record<string, number> = { CROWDED: 3, CONSTRUCTION: 2, CLOSED: 1 };
      const map: Record<string, string> = {};

      for (const s of result.data) {
        const curr = map[s.poiId];
        const currP = curr ? (priority[curr] ?? 0) : 0;
        const newP = priority[s.statusType] ?? 0;
        if (newP >= currP) map[s.poiId] = s.statusType;
      }
      setPoiStatusMap(map);
    };

    fetchLiveStatuses();
  }, [school?.id]);

  // 计算可见 POI
  const rootVisiblePois = useMemo(() => {
    const visible = selectedCategoryIds.length === 0
      ? pois
      : pois.filter((poi) => {
          const categoryId = (poi as POIWithStatus & { categoryId?: string | null }).categoryId;
          return selectedCategoryIds.includes(categoryId ?? "");
        });
    const roots = visible.filter((p) => !p.parentId && p.schoolId === school?.id);
    if (!activePOI) return roots;
    const children = visible.filter((p) => p.parentId === activePOI.id);
    return [...roots, ...children];
  }, [pois, selectedCategoryIds, school?.id, activePOI]);

  // 创建 POI 标记
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !school) return;

    const createMarkerForPoi = (poi: POIWithStatus) => {
      const content = buildPOIMarkerContent(
        poi.id,
        poiStatusMap,
        highlightedPoiId,
        activePOI?.id ?? null,
        selectedSubPOI?.id ?? null
      );

      const marker = new amap.Marker({
        position: [poi.lng, poi.lat],
        content,
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
          const view: MapViewState | null = center && typeof zoom === "number"
            ? { center: [center.getLng(), center.getLat()], zoom }
            : null;
          onPOIClick(poi, view);
        }
      });

      return marker;
    };

    const destroyOldMarkers = () => {
      poiMarkersRef.current.forEach((m) => m.setMap(null));
      poiMarkersRef.current = [];
    };

    if (markerClusterRef.current) {
      markerClusterRef.current.clearMarkers();
      destroyOldMarkers();
      const newMarkers = rootVisiblePois.map(createMarkerForPoi);
      poiMarkersRef.current = newMarkers;
      if (newMarkers.length > 0) markerClusterRef.current.addMarkers(newMarkers);
    } else {
      destroyOldMarkers();
      rootVisiblePois.forEach((poi) => poiMarkersRef.current.push(createMarkerForPoi(poi)));

      if ((amap as any).MarkerCluster && poiMarkersRef.current.length > 0) {
        markerClusterRef.current = new (amap as any).MarkerCluster(
          mapInstanceRef.current,
          poiMarkersRef.current,
          MARKER_CLUSTER_OPTIONS
        );
        const zoom = mapInstanceRef.current?.getZoom?.() ?? 15;
        if (zoom < 15) markerClusterRef.current.setMap(null);
      } else if (poiMarkersRef.current.length > 0) {
        const zoom = mapInstanceRef.current?.getZoom?.() ?? 15;
        if (zoom >= 15) {
          poiMarkersRef.current.forEach((m) => m.setMap(mapInstanceRef.current));
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
  }, [amap, school, rootVisiblePois, poiStatusMap, onPOIClick, selectSubPOI, highlightedPoiId, activePOI, selectedSubPOI, poiMarkersRef, markerClusterRef]);

  // activePOI 选中时 FitView
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !activePOI || !school) return;

    const children = pois.filter((p) => p.parentId === activePOI.id);
    const pointsToFit = [activePOI, ...children];
    if (pointsToFit.length === 0) return;

    const tempMarkers = pointsToFit.map((p) => new amap.Marker({ position: [p.lng, p.lat], map: null }));
    try {
      mapInstanceRef.current.setFitView(tempMarkers, false, FIT_VIEW_PADDING);
    } catch (e) {
      console.warn("setFitView 失败:", e);
    }
  }, [amap, activePOI, pois, school?.id]);

  // activePOI 清除时恢复视图
  useEffect(() => {
    if (!mapInstanceRef.current || activePOI !== null || !mapViewHistory) return;

    try {
      mapInstanceRef.current.setZoomAndCenter(mapViewHistory.zoom, mapViewHistory.center, false, 400);
    } catch (e) {
      console.warn("恢复地图视图失败:", e);
    }
    clearMapViewHistory();
  }, [activePOI, mapViewHistory, clearMapViewHistory]);
}