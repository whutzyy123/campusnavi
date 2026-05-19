/**
 * POI Drawer 实时状态工具函数
 */

import { LIVE_STATUS_BADGE_CONFIG } from "./constants";
import type { StatusBadgeConfig, GroupedStatus } from "./types";

/** 获取状态徽章配置 */
export function getStatusBadgeConfig(statusType: string): StatusBadgeConfig {
  return LIVE_STATUS_BADGE_CONFIG[statusType] ?? {
    label: statusType,
    emoji: "•",
    className: "border-gray-200 bg-gray-50 text-gray-700",
  };
}

/** 将 status 列表按 statusType 分组，返回 { statusType, count, latestCreatedAt }[] */
export function groupStatusesByType(
  statuses: Array<{ id: string; statusType: string; createdAt: string }>
): GroupedStatus[] {
  const groups = new Map<string, { count: number; latestCreatedAt: string }>();
  for (const s of statuses) {
    const existing = groups.get(s.statusType);
    const createdAt = s.createdAt;
    if (!existing) {
      groups.set(s.statusType, { count: 1, latestCreatedAt: createdAt });
    } else {
      existing.count += 1;
      if (new Date(createdAt) > new Date(existing.latestCreatedAt)) {
        existing.latestCreatedAt = createdAt;
      }
    }
  }
  return Array.from(groups.entries()).map(([statusType, { count, latestCreatedAt }]) => ({
    statusType,
    count,
    latestCreatedAt,
  }));
}