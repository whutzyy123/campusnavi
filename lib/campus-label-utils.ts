/**
 * 校区标签位置计算
 * 使用 polylabel（Pole of Inaccessibility）算法，保证标签落在多边形内最“宽敞”的位置
 */

import polylabel from "polylabel";

/** GeoJSON Polygon 或坐标数组 */
export type BoundaryInput =
  | { type: "Polygon"; coordinates: number[][][] }
  | [number, number][];

/**
 * 将 boundary 转为 polylabel 所需格式：[[[lng, lat], ...]]
 */
function toPolylabelFormat(boundary: BoundaryInput): number[][][] {
  if (Array.isArray(boundary) && boundary.length >= 3) {
    const ring = boundary as [number, number][];
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closed =
      first && last && first[0] === last[0] && first[1] === last[1]
        ? ring
        : [...ring, ring[0]];
    return [closed];
  }

  const b = boundary as { type?: string; coordinates?: number[][][] };
  if (b?.type === "Polygon" && Array.isArray(b.coordinates) && b.coordinates[0]?.length >= 3) {
    const ring = b.coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closed =
      first && last && first[0] === last[0] && first[1] === last[1]
        ? ring
        : [...ring, ring[0]];
    return [closed];
  }

  throw new Error("无效的 boundary 格式");
}

/**
 * 确保坐标为 [lng, lat] 格式（AMap/GeoJSON 标准）
 * polylabel 返回与输入相同顺序，但作为防御性检查，若检测到 [lat, lng] 则交换
 */
export function ensureLngLat(a: number, b: number): [number, number] {
  const lngRange = (v: number) => v >= -180 && v <= 180;
  const latRange = (v: number) => v >= -90 && v <= 90;
  if (latRange(a) && !latRange(b) && lngRange(b)) return [b, a]; // [lat, lng] -> [lng, lat]
  if (latRange(b) && !latRange(a) && lngRange(a)) return [a, b]; // [lng, lat] 正确
  return [a, b]; // 无法判断时保持原样
}

/**
 * 使用 polylabel 计算 labelCenter（Pole of Inaccessibility）
 * 对 L 形、U 形、细长多边形等复杂形状更准确
 *
 * @param boundary GeoJSON Polygon 或 [lng, lat][] 坐标数组
 * @param precision 精度，地理坐标建议 0.000001
 * @returns [lng, lat]（AMap 标准）
 */
export function computeLabelCenter(
  boundary: BoundaryInput,
  precision = 0.000001
): [number, number] {
  const polygon = toPolylabelFormat(boundary);
  const result = polylabel(polygon, precision);
  return ensureLngLat(result[0], result[1]);
}
