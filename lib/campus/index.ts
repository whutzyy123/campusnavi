/**
 * 校区管理模块统一导出
 */

// 类型
export type {
  GeoJSONPolygon,
  CampusArea,
  CampusPolygonStyle,
  CampusEditorState,
  AMapInstance,
  AMapMap,
  AMapPolygon,
  AMapText,
  AMapLngLat,
  AMapMouseTool,
  AMapPolygonEditor,
  AMapPlaceSearch,
} from "./types";

// 工具函数
export {
  parseLngLat,
  computeLabelCenter,
  lngLatToArray,
  pathToCoordinates,
} from "./utils";

// 常量
export {
  CAMPUS_POLYGON_STYLE_DEFAULT,
  CAMPUS_POLYGON_STYLE_HIGHLIGHT,
  CAMPUS_POLYGON_STYLE_DRAFT,
  CAMPUS_LABEL_STYLE_EDITING,
  CAMPUS_LABEL_STYLE_NORMAL,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  LABEL_MIN_ZOOM,
  PLUGIN_LOAD_DELAY_MS,
  EDITOR_INIT_DELAY_MS,
  FIT_VIEW_PADDING,
  FIT_VIEW_MAX_ZOOM,
} from "./constants";