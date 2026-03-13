"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";

export type StatCardVariant = "blue" | "green" | "amber" | "slate" | "emerald" | "orange";

const variantStyles: Record<
  StatCardVariant,
  { iconBg: string; iconColor: string }
> = {
  blue: { iconBg: "bg-blue-50", iconColor: "text-blue-600" },
  green: { iconBg: "bg-green-50", iconColor: "text-green-600" },
  amber: { iconBg: "bg-amber-50", iconColor: "text-amber-600" },
  slate: { iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  emerald: { iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  orange: { iconBg: "bg-orange-50", iconColor: "text-orange-600" },
};

interface StatCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  variant?: StatCardVariant;
  isLoading?: boolean;
  /** 点击跳转链接，有则卡片可点击 */
  href?: string;
  /** 紧急任务：显示脉冲效果和「点击立即处理」提示 */
  urgent?: boolean;
  /** 副标签：如 "今日 +3"、"本周 12" */
  subLabel?: React.ReactNode;
}

/**
 * 统计卡片：白底、细边框、左侧主题图标、右侧大数字+标签
 * 支持 href 时整卡可点击跳转；urgent 时显示脉冲与行动提示
 */
export function StatCard({
  icon: Icon,
  value,
  label,
  variant = "slate",
  isLoading = false,
  href,
  urgent = false,
  subLabel,
}: StatCardProps) {
  const { iconBg, iconColor } = variantStyles[variant];

  const content = (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 tabular-nums">
              {value}
            </span>
            {subLabel && (
              <span className="text-xs text-gray-500">{subLabel}</span>
            )}
          </div>
        )}
        <div className="mt-0.5 flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-500">{label}</span>
          {urgent && (
            <span className="text-xs font-medium text-amber-600">
              点击立即处理
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const baseClass =
    "rounded-lg border bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow block " +
    (urgent ? "border-amber-300" : "border-gray-200");

  if (href) {
    return (
      <Link href={href} className={`${baseClass} hover:border-gray-300`}>
        {content}
      </Link>
    );
  }

  return <div className={baseClass}>{content}</div>;
}
