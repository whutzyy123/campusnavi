/**
 * 校区管理常量配置
 */

import { AMAP_Z_INDEX } from "@/lib/poi-map/z-index";

/** 默认多边形样式（普通状态） */
export const CAMPUS_POLYGON_STYLE_DEFAULT = {
  fillColor: "#FF4500",
  fillOpacity: 0.15,
  strokeColor: "#FF4500",
  strokeWeight: 2,
  strokeOpacity: 0.6,
  strokeDasharray: [10, 5],
  zIndex: AMAP_Z_INDEX.polygonBase,
};

/** 高亮多边形样式（编辑/选中状态） */
export const CAMPUS_POLYGON_STYLE_HIGHLIGHT = {
  fillColor: "#FF6600",
  fillOpacity: 0.25,
  strokeColor: "#FF6600",
  strokeWeight: 4,
  strokeOpacity: 1.0,
  strokeDasharray: undefined,
  zIndex: AMAP_Z_INDEX.campusEditorSelected,
};

/** 新建校区预览样式 */
export const CAMPUS_POLYGON_STYLE_DRAFT = {
  fillColor: "#FF4500",
  fillOpacity: 0.2,
  strokeColor: "#FF4500",
  strokeWeight: 3,
  strokeOpacity: 0.8,
  zIndex: AMAP_Z_INDEX.polygonDraft,
};

/** 编辑时标签样式 */
export const CAMPUS_LABEL_STYLE_EDITING = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#FF6600",
  backgroundColor: "rgba(255, 255, 255, 0.95)",
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid #FF6600",
};

/** 普通标签样式 */
export const CAMPUS_LABEL_STYLE_NORMAL = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#FF4500",
  backgroundColor: "rgba(255, 255, 255, 0.9)",
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid #FF4500",
};

/** 默认地图中心（北京） */
export const DEFAULT_MAP_CENTER: [number, number] = [116.397428, 39.90923];

/** 默认地图缩放级别 */
export const DEFAULT_MAP_ZOOM = 14;

/** 标签显示的最小缩放级别 */
export const LABEL_MIN_ZOOM = 16;

/** 插件加载延迟时间（毫秒） */
export const PLUGIN_LOAD_DELAY_MS = 500;

/** 编辑器初始化延迟时间（毫秒） */
export const EDITOR_INIT_DELAY_MS = 50;

/** 定位校区时的边距 */
export const FIT_VIEW_PADDING = [60, 60, 60, 60] as const;

/** 定位校区时的最大缩放级别 */
export const FIT_VIEW_MAX_ZOOM = 17;