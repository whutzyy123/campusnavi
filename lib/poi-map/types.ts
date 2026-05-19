/**
 * POI 地图组件类型定义
 */

import type { School, MapViewState } from "@/store/use-school-store";
import type { POIWithStatus } from "@/lib/geo/poi-utils";

/** POIMap 组件 Props */
export interface POIMapProps {
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

/** POIMap 暴露给父组件的方法 */
export interface POIMapRef {
  locate: () => void;
  isLocating: boolean;
}

/** POI 标记扩展数据 */
export interface PoiMarkerData {
  poi: POIWithStatus;
}

/** 导航状态（从 useNavigationStore 提取） */
export interface NavigationState {
  isNavigating: boolean;
  startPoint: { lng: number; lat: number; name: string } | null;
  endPoint: { lng: number; lat: number; name: string } | null;
  navMode: "walk" | "ride";
}

/** 地图 refs 容器（用于跨 hook 共享） */
export interface POIMapRefs {
  mapInstanceRef: React.RefObject<any>;
  boundaryPolygonRef: React.RefObject<any>;
  campusPolygonsRef: React.RefObject<Map<string, any>>;
  campusLabelsRef: React.RefObject<Map<string, any>>;
  userMarkerRef: React.RefObject<any>;
  poiMarkersRef: React.RefObject<any[]>;
  markerClusterRef: React.RefObject<any>;
  highlightMarkerRef: React.RefObject<any>;
  walkingRef: React.RefObject<any>;
  ridingRef: React.RefObject<any>;
  routePolylineRef: React.RefObject<any>;
  startMarkerRef: React.RefObject<any>;
  endMarkerRef: React.RefObject<any>;
  pickStartMarkerRef: React.RefObject<any>;
  pickEndMarkerRef: React.RefObject<any>;
  geolocationRef: React.RefObject<any>;
}
