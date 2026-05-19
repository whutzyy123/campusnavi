/**
 * POI 地图初始化 Hook
 * 负责地图实例创建、缩放事件监听、点击事件处理
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useAMap } from "@/hooks/use-amap";
import { useNavigationStore } from "@/store/use-navigation-store";
import { analytics } from "@/lib/analytics";
import {
  ZOOM_LOD_THRESHOLD,
  DEFAULT_CENTER,
  DEFAULT_ZOOM_NO_SCHOOL,
  DEFAULT_ZOOM_WITH_SCHOOL,
} from "@/lib/poi-map";
import type { School } from "@/store/use-school-store";

export interface UsePOIMapInitOptions {
  school: School | null;
  onMapBackgroundClick?: () => void;
  markerClusterRef: React.RefObject<any>;
  poiMarkersRef: React.RefObject<any[]>;
}

export interface UsePOIMapInitResult {
  mapRef: React.RefObject<HTMLDivElement>;
  mapInstanceRef: React.RefObject<any>;
  mapReady: boolean;
  loading: boolean;
  error: Error | null;
  amap: any;
}

/**
 * POI 地图初始化 Hook
 */
export function usePOIMapInit(options: UsePOIMapInitOptions): UsePOIMapInitResult {
  const { school, onMapBackgroundClick, markerClusterRef, poiMarkersRef } = options;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const zoomUpdateTimeoutRef = useRef<number | null>(null);

  // 使用 ref 存储回调函数，避免依赖项变化
  const onMapBackgroundClickRef = useRef(onMapBackgroundClick);
  useEffect(() => {
    onMapBackgroundClickRef.current = onMapBackgroundClick;
  }, [onMapBackgroundClick]);

  const { amap, loading, error } = useAMap();
  const selectMode = useNavigationStore((s) => s.selectMode);

  // 更新 zoom level 属性（LOD 切换）
  const updateZoomLevelAttr = useCallback(() => {
    if (!mapRef.current || !mapInstanceRef.current) return;
    const currentZoom = mapInstanceRef.current.getZoom ? mapInstanceRef.current.getZoom() : 16;
    const level = currentZoom < ZOOM_LOD_THRESHOLD ? "low" : "high";
    mapRef.current.setAttribute("data-zoom-level", level);

    // Zoom < 16 时隐藏 MarkerCluster（含聚合气泡与单点）
    if (markerClusterRef.current) {
      markerClusterRef.current.setMap(currentZoom >= ZOOM_LOD_THRESHOLD ? mapInstanceRef.current : null);
    }
    // 无聚合时直接控制单点 Marker 显隐
    if (!markerClusterRef.current && poiMarkersRef.current && poiMarkersRef.current.length > 0) {
      poiMarkersRef.current.forEach((m: any) => {
        m.setMap(currentZoom >= ZOOM_LOD_THRESHOLD ? mapInstanceRef.current : null);
      });
    }
  }, [markerClusterRef, poiMarkersRef]);

  // 初始化地图（仅创建一次，不随 school 变化重新创建）
  useEffect(() => {
    if (!amap || !mapRef.current || mapInstanceRef.current) {
      return;
    }

    // 确定地图中心点：必须使用学校几何中心，禁止使用用户位置
    const center: [number, number] =
      school?.centerLng != null && school?.centerLat != null
        ? [school.centerLng, school.centerLat]
        : DEFAULT_CENTER;

    // 创建地图实例
    const map = new amap.Map(mapRef.current, {
      zoom: school ? DEFAULT_ZOOM_WITH_SCHOOL : DEFAULT_ZOOM_NO_SCHOOL,
      center,
      viewMode: "3D",
      mapStyle: "amap://styles/normal",
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    // 使用简单的节流，避免缩放事件高频触发导致重复计算
    const handleZoomChange = () => {
      if (zoomUpdateTimeoutRef.current !== null) {
        window.clearTimeout(zoomUpdateTimeoutRef.current);
      }
      zoomUpdateTimeoutRef.current = window.setTimeout(() => {
        updateZoomLevelAttr();
      }, 100);
    };

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

      // 非选点模式：点击地图空白处，通知父组件关闭抽屉并清除选中
      if (!currentMode) {
        onMapBackgroundClickRef.current?.();
      }
    };

    // 初始化时先设置一次
    updateZoomLevelAttr();

    // 监听缩放变化（节流处理）
    map.on("zoomend", handleZoomChange);
    map.on("zoomchange", handleZoomChange);
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

  return {
    mapRef,
    mapInstanceRef,
    mapReady,
    loading,
    error,
    amap,
  };
}
