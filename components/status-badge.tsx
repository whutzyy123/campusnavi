/**
 * 统一状态徽章组件
 * 按领域（domain）和状态值映射到 Badge 的 variant 与中文标签
 */

import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeDomain =
  | "market"
  | "invitation"
  | "user"
  | "school"
  | "comment"
  | "activity";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface StatusConfig {
  variant: BadgeVariant;
  label: string;
  /** 可选自定义 className 覆盖 variant */
  className?: string;
}

const STATUS_MAP: Record<StatusBadgeDomain, Record<string, StatusConfig>> = {
  market: {
    ACTIVE: { variant: "success", label: "在售" },
    HIDDEN: { variant: "error", label: "已下架" },
    LOCKED: { variant: "info", label: "已锁定", className: "bg-blue-100 text-blue-800" },
    COMPLETED: { variant: "default", label: "已完成" },
    DELETED: { variant: "error", label: "已删除" },
  },
  invitation: {
    ACTIVE: { variant: "success", label: "激活" },
    USED: { variant: "default", label: "已使用", className: "bg-gray-200 text-gray-700" },
    DISABLED: { variant: "default", label: "已撤销", className: "bg-gray-200 text-gray-700" },
    DEACTIVATED: { variant: "error", label: "已停用" },
  },
  user: {
    ACTIVE: { variant: "success", label: "正常" },
    INACTIVE: { variant: "error", label: "已停用" },
    SUPER_ADMIN: { variant: "error", label: "超级管理员" },
    ADMIN: { variant: "warning", label: "校级管理员" },
    STAFF: { variant: "info", label: "工作人员" },
    STUDENT: { variant: "default", label: "学生" },
  },
  school: {
    true: { variant: "success", label: "已激活" },
    false: { variant: "error", label: "已停用" },
  },
  comment: {
    hidden: { variant: "error", label: "已隐藏" },
    visible: { variant: "success", label: "可见" },
  },
  activity: {
    active: { variant: "success", label: "进行中" },
    ended: { variant: "default", label: "已结束", className: "bg-gray-200 text-gray-700" },
    expired: { variant: "default", label: "已过期", className: "bg-gray-200 text-gray-700" },
  },
};

export interface StatusBadgeProps {
  domain: StatusBadgeDomain;
  status: string | boolean;
  /** 覆盖默认标签（如 "被举报 N 次"） */
  labelOverride?: string;
  /** 覆盖 variant（如 reportCount 用 error） */
  variantOverride?: BadgeVariant;
  className?: string;
}

export function StatusBadge({ domain, status, labelOverride, variantOverride, className }: StatusBadgeProps) {
  const statusKey = typeof status === "boolean" ? String(status) : status;
  const config = STATUS_MAP[domain]?.[statusKey] ?? {
    variant: "default" as BadgeVariant,
    label: statusKey,
  };

  const label = labelOverride ?? config.label;
  const variant = variantOverride ?? config.variant;

  return (
    <Badge
      variant={variant}
      className={cn(config.className, className)}
    >
      {label}
    </Badge>
  );
}
