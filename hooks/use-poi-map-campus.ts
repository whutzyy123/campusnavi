/**
 * POI 地图校区 Hook
 * 负责校区边界绘制、标签显示和校区聚焦
 */

import { useEffect, useState, useCallback } from "react";
import { centroid, polygon } from "@turf/turf";
import { parseLngLat } from "@/lib/geo/poi-map-helpers";
import { getCampuses, type CampusAreaItem } from "@/lib/school/actions";
import {
  CAMPUS_POLYGON_STYLE,
  CAMPUS_LABEL_STYLE,
  CAMPUS_LABEL_ZOOM_THRESHOLD,
  FIT_VIEW_PADDING,
  AMAP_Z_INDEX,
} from "@/lib/poi-map";
import { useNavigationStore } from "@/store/use-navigation-store";
import { analytics } from "@/lib/analytics";
import type { School } from "@/store/use-school-store";

export interface UsePOIMapCampusOptions {
  amap: any;
  mapInstanceRef: React.MutableRefObject<any>;
  mapReady: boolean;
  school: School | null;
  campusPolygonsRef: React.MutableRefObject<Map<string, any>>;
  campusLabelsRef: React.MutableRefObject<Map<string, any>>;
  boundaryPolygonRef: React.MutableRefObject<any>;
}

export interface UsePOIMapCampusResult {
  campuses: CampusAreaItem[];
}

export function usePOIMapCampus(options: UsePOIMapCampusOptions): UsePOIMapCampusResult {
  const {
    amap,
    mapInstanceRef,
    mapReady,
    school,
    campusPolygonsRef,
    campusLabelsRef,
    boundaryPolygonRef,
  } = options;

  const [campuses, setCampuses] = useState<CampusAreaItem[]>([]);

  // 加载校区列表
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
  }, [school?.id]);

  // 绘制校区多边形和标签
  const drawCampuses = useCallback(() => {
    if (!amap || !mapInstanceRef.current || !school) return;

    const map = mapInstanceRef.current;

    // 清除旧的校区多边形和标签
    campusPolygonsRef.current.forEach((poly) => {
      try { map.remove(poly); } catch (e) { console.warn("移除校区多边形失败:", e); }
    });
    campusPolygonsRef.current.clear();

    campusLabelsRef.current.forEach((label) => {
      try { map.remove(label); } catch (e) { console.warn("移除校区标签失败:", e); }
    });
    campusLabelsRef.current.clear();

    if (campuses.length === 0) {
      if (school.centerLng != null && school.centerLat != null) {
        map.setZoomAndCenter(16, [school.centerLng, school.centerLat]);
      }
      return;
    }

    campuses.forEach((campus) => {
      let boundary = campus.boundary;
      if (typeof boundary === "string") {
        try { boundary = JSON.parse(boundary); } catch { return; }
      }

      const b = boundary as { type?: string; coordinates?: unknown[][] } | null;
      if (!b || b.type !== "Polygon") return;

      const coordinates = b.coordinates?.[0];
      if (!Array.isArray(coordinates) || coordinates.length === 0) return;

      // 创建校区多边形
      const campusPoly = new amap.Polygon({
        path: coordinates,
        ...CAMPUS_POLYGON_STYLE,
      });
      campusPoly.setMap(map);
      campusPolygonsRef.current.set(campus.id, campusPoly);

      // 校区 Polygon 点击事件（选点模式）
      campusPoly.on("click", (e: any) => {
        const navState = useNavigationStore.getState();
        const mode = navState.selectMode;
        if (mode && e?.lnglat) {
          const lng = typeof e.lnglat.getLng === "function" ? e.lnglat.getLng() : e.lnglat.lng;
          const lat = typeof e.lnglat.getLat === "function" ? e.lnglat.getLat() : e.lnglat.lat;
          const point = { lng, lat, name: mode === "start" ? "自由选点(起点)" : "自由选点(终点)" };
          if (mode === "start") {
            analytics.nav.startSet({ source: "map_click" });
            navState.setStartPoint(point);
          } else {
            analytics.nav.endSet({ source: "map_click" });
            navState.setEndPoint(point);
          }
          navState.setSelectMode(null);
        }
      });

      // 创建校区标签
      const labelPos = campus.labelCenter ?? campus.center;
      const [centerLng, centerLat] = parseLngLat(labelPos);
      const text = new amap.Text({
        text: campus.name,
        position: [centerLng, centerLat],
        anchor: "center",
        style: CAMPUS_LABEL_STYLE,
        zIndex: AMAP_Z_INDEX.polygonLabel,
      });
      text.setMap(map);
      campusLabelsRef.current.set(campus.id, text);
    });

    // 校区标签可见性控制
    const updateLabelVisibility = () => {
      if (!mapInstanceRef.current) return;
      const zoom = mapInstanceRef.current.getZoom();
      const shouldShow = zoom < CAMPUS_LABEL_ZOOM_THRESHOLD;
      campusLabelsRef.current.forEach((label) => {
        if (label && typeof label.show === "function" && typeof label.hide === "function") {
          shouldShow ? label.show() : label.hide();
        } else if (label && typeof label.setMap === "function") {
          label.setMap(shouldShow ? mapInstanceRef.current : null);
        }
      });
    };

    mapInstanceRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // setFitView 到校区范围
    const polys = Array.from(campusPolygonsRef.current.values());
    if (polys.length > 0 && school.centerLng != null && school.centerLat != null) {
      try {
        map.setFitView(polys, false, FIT_VIEW_PADDING, 17);
      } catch {
        map.setZoomAndCenter(16, [school.centerLng, school.centerLat]);
      }
    }
  }, [amap, school, campuses, campusPolygonsRef, campusLabelsRef]);

  // 绘制校区边界
  useEffect(() => {
    if (!amap || !mapInstanceRef.current) return;

    if (!school) {
      campusPolygonsRef.current.forEach((p) => { try { mapInstanceRef.current.remove(p); } catch {} });
      campusPolygonsRef.current.clear();
      campusLabelsRef.current.forEach((l) => { try { mapInstanceRef.current.remove(l); } catch {} });
      campusLabelsRef.current.clear();
      if (boundaryPolygonRef.current) {
        try { mapInstanceRef.current.remove(boundaryPolygonRef.current); } catch {}
        boundaryPolygonRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => drawCampuses(), 100);
    return () => clearTimeout(timer);
  }, [amap, school, drawCampuses]);

  return { campuses };
}