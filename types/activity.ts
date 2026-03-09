/**
 * Activity 相关类型定义
 * 供 Server Components 及 activity-actions 使用
 */

/** 活动状态：进行中 | 即将开始 | 已过期 */
export type ActivityStatus = "ONGOING" | "UPCOMING" | "EXPIRED";

/** 关联 POI 的简要信息（用于 ActivityWithPOI） */
export interface ActivityPOIInfo {
  id: string;
  name: string;
  /** 地址（POI 无 address 字段时返回 null，预留扩展） */
  address: string | null;
}

/** 活动基础字段（ISO 字符串格式，便于序列化） */
export interface ActivityBase {
  id: string;
  schoolId: string;
  poiId: string;
  title: string;
  description: string;
  link: string | null;
  startAt: string;
  endAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 活动 + 关联 POI 信息（供 ActivityDetailModal、ActivityCard 等使用）
 * 必须包含字段：id, title, description, startAt, endAt, link, poi(id, name, address)
 */
export interface ActivityWithPOI extends ActivityBase {
  poi: ActivityPOIInfo;
}

/**
 * 计算活动状态
 * - Ongoing: now >= startAt AND now <= endAt
 * - Upcoming: now < startAt
 * - Expired: now > endAt
 */
export function getActivityStatus(
  activity: { startAt: Date | string; endAt: Date | string },
  now: Date = new Date()
): ActivityStatus {
  const start = typeof activity.startAt === "string" ? new Date(activity.startAt) : activity.startAt;
  const end = typeof activity.endAt === "string" ? new Date(activity.endAt) : activity.endAt;

  if (now < start) return "UPCOMING";
  if (now > end) return "EXPIRED";
  return "ONGOING";
}
