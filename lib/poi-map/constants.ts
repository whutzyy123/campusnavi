/**
 * POI 地图常量定义
 */

import { AMAP_Z_INDEX } from "./z-index";

/** LOD 阈值：Zoom < 16 时隐藏 POI 标记 */
export const ZOOM_LOD_THRESHOLD = 16;

/** 校区标签可见性阈值：Zoom < 15 时显示校区标签 */
export const CAMPUS_LABEL_ZOOM_THRESHOLD = 15;

/** 默认地图中心点（北京） */
export const DEFAULT_CENTER: [number, number] = [116.397428, 39.90923];

/** 默认缩放级别（无学校数据时） */
export const DEFAULT_ZOOM_NO_SCHOOL = 15;

/** 默认缩放级别（有学校数据时） */
export const DEFAULT_ZOOM_WITH_SCHOOL = 16;

/** 定位超时时间（毫秒） */
export const GEOLOCATION_TIMEOUT = 15000;

/** 校区多边形样式 */
export const CAMPUS_POLYGON_STYLE = {
  fillColor: "#FF4500",
  fillOpacity: 0.08,
  strokeColor: "#FF4500",
  strokeWeight: 2,
  strokeOpacity: 0.5,
  strokeDasharray: [10, 5] as [number, number],
  zIndex: AMAP_Z_INDEX.polygonBase,
};

/** 校区标签样式 */
export const CAMPUS_LABEL_STYLE = {
  fontSize: "14px",
  fontWeight: "bold" as const,
  color: "#FF4500",
  backgroundColor: "rgba(255, 255, 255, 0.95)",
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid #FF4500",
};

/** 导航路线样式 */
export const ROUTE_POLYLINE_STYLE = {
  walk: {
    strokeColor: "#FF4500",
    strokeOpacity: 1,
    strokeWeight: 6,
  },
  ride: {
    strokeColor: "#0079D3",
    strokeOpacity: 1,
    strokeWeight: 6,
  },
};

/** MarkerCluster 配置 */
export const MARKER_CLUSTER_OPTIONS = {
  gridSize: 80,
  maxZoom: 17,
};

/** setFitView padding */
export const FIT_VIEW_PADDING: [number, number, number, number] = [60, 60, 60, 60];

/** setFitView padding（导航时） */
export const NAV_FIT_VIEW_PADDING: [number, number, number, number] = [50, 50, 50, 50];
