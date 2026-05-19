/**
 * 校区管理类型定义
 */

/** GeoJSON Polygon 结构 */
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

/** 校区区域数据结构 */
export interface CampusArea {
  id: string;
  schoolId: string;
  name: string;
  boundary: GeoJSONPolygon | string | unknown; // GeoJSON Polygon (可以是对象或 JSON 字符串)
  center: [number, number]; // [lng, lat]
  labelCenter?: [number, number] | unknown;
  createdAt: string;
  updatedAt: string;
}

/** 多边形样式配置 */
export interface CampusPolygonStyle {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
  strokeOpacity: number;
  strokeDasharray?: number[];
  zIndex: number;
}

/** 编辑器状态 */
export interface CampusEditorState {
  isEditing: boolean;
  editingCampusId: string | null;
  isDrawing: boolean;
  selectedCampusId: string | null;
}

/** AMap 实例类型（简化） */
export interface AMapInstance {
  Map: new (container: HTMLElement | null, options: Record<string, unknown>) => AMapMap;
  Polygon: new (options: Record<string, unknown>) => AMapPolygon;
  Text: new (options: Record<string, unknown>) => AMapText;
  MouseTool: new (map: AMapMap) => AMapMouseTool;
  PolygonEditor: new (map: AMapMap, polygon: AMapPolygon, options?: Record<string, unknown>) => AMapPolygonEditor;
  PlaceSearch: new (options: Record<string, unknown>) => AMapPlaceSearch;
}

export interface AMapMap {
  setCenter: (center: [number, number]) => void;
  getCenter: () => { lng: number; lat: number };
  setZoom: (zoom: number) => void;
  getZoom: () => number;
  panTo: (position: [number, number]) => void;
  setFitView: (overlays: AMapPolygon[], immediately?: boolean, avoid?: number[], maxZoom?: number) => void;
  remove: (overlay: AMapPolygon | AMapText) => void;
  destroy: () => void;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
  render?: () => void;
  add: (overlay: AMapPolygon | AMapText) => void;
}

export interface AMapPolygon {
  setMap: (map: AMapMap | null) => void;
  getMap: () => AMapMap | null;
  getPath: () => AMapLngLat[];
  setPath: (path: [number, number][]) => void;
  setOptions: (options: Record<string, unknown>) => void;
  getOptions: () => Record<string, unknown>;
  hide: () => void;
  show: () => void;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
}

export interface AMapText {
  setMap: (map: AMapMap | null) => void;
  setPosition: (position: [number, number]) => void;
  show: () => void;
  hide: () => void;
}

export interface AMapLngLat {
  getLng: () => number;
  getLat: () => number;
  lng?: number;
  lat?: number;
}

export interface AMapMouseTool {
  polygon: (options: Record<string, unknown>) => void;
  close: () => void;
  on: (event: string, callback: (e: { obj: AMapPolygon }) => void) => void;
}

export interface AMapPolygonEditor {
  open: () => void;
  close: () => void;
  on: (event: string, callback: (e?: unknown) => void) => void;
  off: (event: string, callback: () => void) => void;
  target?: AMapPolygon;
}

export interface AMapPlaceSearch {
  search: (keyword: string, callback: (status: string, data: unknown) => void) => void;
}
