/**
 * 地理坐标工具
 * 使用 GCJ-02 坐标系（高德）
 */

/**
 * 计算两点间距离（米），使用 Haversine 公式
 * @param from [lng, lat]
 * @param to [lng, lat]
 */
export function distanceMeters(
  from: [number, number],
  to: [number, number]
): number {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const R = 6371000; // 地球半径（米）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
