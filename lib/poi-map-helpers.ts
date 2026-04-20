import { ensureLngLat } from "@/lib/campus-label-utils";

/** 从 [lng, lat] 或 GeoJSON Point 解析坐标，确保 [lng, lat] 顺序 */
export function parseLngLat(v: unknown): [number, number] {
  if (!v) return [0, 0];
  if (Array.isArray(v) && v.length >= 2) return ensureLngLat(Number(v[0]), Number(v[1]));
  const obj = v as { coordinates?: unknown[] };
  if (obj?.coordinates && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
    return ensureLngLat(Number(obj.coordinates[0]), Number(obj.coordinates[1]));
  }
  return [0, 0];
}

/** 根据 statusType 返回 Marker 徽章 HTML（空字符串表示无徽章） */
export function getStatusBadgeHtml(statusType: string): string {
  switch (statusType) {
    case "CROWDED":
      return `<span class="poi-status-badge poi-status-crowded" title="\u4eba\u591a\u62e5\u6324">\uD83D\uDD25</span>`;
    case "CONSTRUCTION":
      return `<span class="poi-status-badge poi-status-construction" title="\u65bd\u5de5\u7ed5\u884c">\uD83D\uDEA7</span>`;
    case "CLOSED":
      return `<span class="poi-status-badge poi-status-closed" title="\u6682\u65f6\u5173\u95ed">\uD83D\uDD12</span>`;
    default:
      return "";
  }
}
