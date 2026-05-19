/**
 * POI 地图组件
 * 支持显示学校边界和 POI 标记
 */

"use client";

import { useRef, useImperativeHandle, forwardRef } from "react";
import { usePOIMapInit } from "@/hooks/use-poi-map-init";
import { usePOIMapLocation } from "@/hooks/use-poi-map-location";
import { usePOIMapCampus } from "@/hooks/use-poi-map-campus";
import { usePOIMapMarkers } from "@/hooks/use-poi-map-markers";
import { usePOIMapNavigation } from "@/hooks/use-poi-map-navigation";
import { usePOIMapHighlight } from "@/hooks/use-poi-map-highlight";
import type { POIMapProps, POIMapRef } from "@/lib/poi-map";

export const POIMap = forwardRef<POIMapRef, POIMapProps>(
  ({ school, pois, userLocation, onPOIClick, onMapBackgroundClick, onLocationUpdate, onLocatingChange, className = "w-full h-screen" }, ref) => {
    // Refs 容器（跨 hook 共享）
    const mapInstanceRef = useRef<any>(null);
    const boundaryPolygonRef = useRef<any>(null);
    const campusPolygonsRef = useRef<Map<string, any>>(new Map());
    const campusLabelsRef = useRef<Map<string, any>>(new Map());
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
    const geolocationRef = useRef<any>(null);

    // 1. 地图初始化
    const { mapRef, mapReady, loading, error, amap } = usePOIMapInit({
      school,
      onMapBackgroundClick,
      markerClusterRef,
      poiMarkersRef,
    });

    // 2. 定位功能
    const { isLocating, currentUserLocation, locate } = usePOIMapLocation({
      amap,
      mapInstanceRef,
      mapReady,
      school,
      userLocation,
      onLocationUpdate,
      onLocatingChange,
      userMarkerRef,
      geolocationRef,
    });

    // 3. 校区边界
    const { campuses } = usePOIMapCampus({
      amap,
      mapInstanceRef,
      mapReady,
      school,
      campusPolygonsRef,
      campusLabelsRef,
      boundaryPolygonRef,
    });

    // 4. POI 标记
    usePOIMapMarkers({
      amap,
      mapInstanceRef,
      mapReady,
      school,
      pois,
      onPOIClick,
      poiMarkersRef,
      markerClusterRef,
    });

    // 5. 导航功能
    usePOIMapNavigation({
      amap,
      mapInstanceRef,
      mapReady,
      routePolylineRef,
      startMarkerRef,
      endMarkerRef,
      pickStartMarkerRef,
      pickEndMarkerRef,
      walkingRef,
      ridingRef,
    });

    // 6. 高亮效果
    usePOIMapHighlight({
      amap,
      mapInstanceRef,
      mapReady,
      school,
      pois,
      campuses,
      highlightMarkerRef,
      pickStartMarkerRef,
      pickEndMarkerRef,
    });

    // 暴露定位方法给父组件
    useImperativeHandle(ref, () => ({
      locate,
      isLocating,
    }), [locate, isLocating]);

    // 渲染
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
