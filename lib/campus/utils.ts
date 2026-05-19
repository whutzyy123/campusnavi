/**
 * 校区管理工具函数
 */

import polylabel from "polylabel";
import { ensureLngLat } from "@/lib/geo/campus-label-utils";

/**
 * 从 [lng, lat] 或 GeoJSON Point 解析坐标
 * @param v - 坐标值，可以是数组或 GeoJSON Point 对象
 * @returns [lng, lat] 坐标数组
 */
export function parseLngLat(v: unknown): [number, number] {
  if (!v) return [0, 0];
  
  // 数组格式：[lng, lat]
  if (Array.isArray(v) && v.length >= 2) {
    return [Number(v[0]), Number(v[1])];
  }
  
  // GeoJSON Point 格式：{ coordinates: [lng, lat] }
  const obj = v as { coordinates?: unknown[] };
  if (obj?.coordinates && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
    return [Number(obj.coordinates[0]), Number(obj.coordinates[1])];
  }
  
  return [0, 0];
}

/**
 * 从坐标数组计算 labelCenter（polylabel - Pole of Inaccessibility）
 * 用于计算多边形内的最优标签位置
 * @param coordinates - 多边形顶点坐标数组 [lng, lat]
 * @returns labelCenter 坐标 [lng, lat]
 */
export function computeLabelCenter(coordinates: [number, number][]): [number, number] {
  if (!coordinates || coordinates.length < 3) return [0, 0];
  
  // 确保多边形闭合（首尾点相同）
  const closed =
    coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
    coordinates[0][1] === coordinates[coordinates.length - 1][1]
      ? coordinates
      : [...coordinates, coordinates[0]];
  
  // polylabel 需要嵌套数组格式：[[[lng, lat], ...]]
  const polygon = [closed];
  const result = polylabel(polygon, 0.000001);
  
  return ensureLngLat(result[0], result[1]);
}

/**
 * 将 AMap LngLat 对象转换为坐标数组
 * @param point - AMap LngLat 对象或坐标数组
 * @returns [lng, lat] 坐标数组
 */
export function lngLatToArray(point: unknown): [number, number] | null {
  if (!point) return null;
  
  // AMap LngLat 对象（含 getLng/getLat 方法）
  if (typeof point === "object" && point !== null) {
    const p = point as { getLng?: () => number; getLat?: () => number; lng?: number; lat?: number };
    if (typeof p.getLng === "function" && typeof p.getLat === "function") {
      return [p.getLng(), p.getLat()];
    }
    if (typeof p.lng === "number" && typeof p.lat === "number") {
      return [p.lng, p.lat];
    }
  }
  
  // 数组格式
  if (Array.isArray(point) && point.length === 2) {
    return [Number(point[0]), Number(point[1])];
  }
  
  return null;
}

/**
 * 将路径数组转换为纯坐标数组
 * @param path - AMap LngLat 对象数组
 * @returns 纯坐标数组 [[lng, lat], ...]
 */
export function pathToCoordinates(path: unknown[]): [number, number][] {
  return path
    .map((point) => lngLatToArray(point))
    .filter((coord): coord is [number, number] => coord !== null);
}