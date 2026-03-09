import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 日期时间格式化（中文）
 * @param date Date 或 ISO 字符串
 * @param options 格式选项
 */
export function formatDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", options ?? { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * 短日期格式（月/日）
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

/**
 * 日期时间格式（含时分）
 */
export function formatDateTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("zh-CN", options ?? {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 日期时间格式 YYYY-MM-DD HH:mm
 */
export function formatDateTimeDisplay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 相对时间（如 "10分钟前"、"1小时前"）
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

/**
 * 剩余时间格式化（用于活动结束倒计时）
 * @param endAt 结束时间
 * @returns "X天X小时" | "X小时X分钟" | "X分钟" | 或精确时间（不足1分钟时）
 */
export function formatTimeRemaining(endAt: Date | string): string {
  const end = typeof endAt === "string" ? new Date(endAt) : endAt;
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return "已结束";

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "即将结束";
  if (diffMins < 60) return `${diffMins}分钟`;
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return mins > 0 ? `${diffHours}小时${mins}分钟` : `${diffHours}小时`;
  }
  const hours = diffHours % 24;
  return hours > 0 ? `${diffDays}天${hours}小时` : `${diffDays}天`;
}

/**
 * 短日期时间格式（月日 时分）
 */
export function formatDateTimeShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 价格格式化（人民币）
 */
export function formatPrice(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return `¥${Number(amount).toFixed(2)}`;
}

/**
 * 截断文本，用于预览
 */
export function truncateText(text: string, maxLen: number = 50): string {
  if (!text) return "";
  return text.length <= maxLen ? text : text.slice(0, maxLen) + "…";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 分页单页最大数量，防止一次拉取过多数据 */
const MAX_PAGE_LIMIT = 100;

/**
 * 分页查询辅助函数
 * @param page 页码（从1开始）
 * @param limit 每页数量（最大 100）
 * @returns Prisma 查询参数 { skip, take }
 */
export function getPaginationParams(page: number, limit: number) {
  const pageNum = Math.max(1, Math.floor(page));
  const limitNum = Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(limit)));

  return {
    skip: (pageNum - 1) * limitNum,
    take: limitNum,
  };
}

/**
 * 计算分页元数据
 * @param total 总记录数
 * @param page 当前页码
 * @param limit 每页数量
 * @returns 分页元数据
 */
export function getPaginationMeta(total: number, page: number, limit: number) {
  const pageNum = Math.max(1, Math.floor(page));
  const limitNum = Math.max(1, Math.floor(limit));
  const pageCount = Math.ceil(total / limitNum);
  
  return {
    total,
    pageCount,
    currentPage: pageNum,
    limit: limitNum,
  };
}

