"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/core/utils";

export type StatCardVariant = "blue" | "green" | "amber" | "slate" | "emerald" | "orange";

const variantStyles: Record<
  StatCardVariant,
  { iconBg: string; iconColor: string; borderAccent: string }
> = {
  blue: { iconBg: "bg-blue-50", iconColor: "text-blue-600", borderAccent: "border-l-blue-500" },
  green: { iconBg: "bg-green-50", iconColor: "text-green-600", borderAccent: "border-l-green-500" },
  amber: { iconBg: "bg-amber-50", iconColor: "text-amber-600", borderAccent: "border-l-amber-500" },
  slate: { iconBg: "bg-slate-100", iconColor: "text-slate-600", borderAccent: "border-l-slate-400" },
  emerald: { iconBg: "bg-emerald-50", iconColor: "text-emerald-600", borderAccent: "border-l-emerald-500" },
  orange: { iconBg: "bg-[#FFE5DD]", iconColor: "text-[#FF4500]", borderAccent: "border-l-[#FF4500]" },
};

interface StatCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  variant?: StatCardVariant;
  isLoading?: boolean;
  href?: string;
  urgent?: boolean;
  subLabel?: React.ReactNode;
}

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
  const { iconBg, iconColor, borderAccent } = variantStyles[variant];

  const content = (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
          iconBg,
          iconColor
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#1A1A1B] tabular-nums tracking-tight">
              {value}
            </span>
            {subLabel && (
              <span className="text-xs text-[#7C7C7C]">{subLabel}</span>
            )}
          </div>
        )}
        <div className="mt-0.5 flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[#7C7C7C]">{label}</span>
          {urgent && (
            <span className="text-xs font-semibold text-[#FF4500]">
              点击立即处理
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const baseClass = cn(
    "group rounded-xl border border-[#EDEFF1] border-l-[3px] bg-white px-4 py-4 shadow-sm transition-all hover:shadow-md",
    borderAccent,
    urgent && "border-amber-300 border-l-amber-500"
  );

  if (href) {
    return (
      <Link href={href} className={cn(baseClass, "hover:border-l-[4px] active:scale-[0.98]")}>
        {content}
      </Link>
    );
  }

  return <div className={baseClass}>{content}</div>;
}
