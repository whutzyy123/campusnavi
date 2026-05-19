/**
 * 高德地图画布内 overlay 层级（Marker / Polyline / Polygon）。
 * 仅作用于 AMap SDK setOptions({ zIndex })，不参与 App Portal 层（见 lib/ui/z-index.ts）。
 */

export const AMAP_Z_INDEX = {
  /** 校区多边形、底图装饰 */
  polygonBase: 10,
  polygonLabel: 20,
  polygonDraft: 50,
  /** 导航起终点标记 */
  navEndpoint: 50,
  /** 导航路线折线 */
  navRoute: 90,
  /** 导航路线高亮 / 选中 */
  navRouteActive: 100,
  /** POI 高亮脉冲 */
  highlightPulse: 500,
  /** 用户定位 Marker — 置于地图元素最上 */
  userLocation: 1000,
  /** 管理端 POI 编辑选中 */
  adminPoiSelected: 200,
  adminPoiHover: 150,
  adminPoiDefault: 100,
  /** 校区编辑器选中多边形 */
  campusEditorSelected: 100,
  campusEditorHandle: 110,
  campusEditorMidpoint: 60,
} as const;
