"use client";

import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** 时间粒度切换 */
  granularity?: React.ReactNode;
}

/**
 * 图表卡片：白底、标题、可选描述与时间粒度切换
 */
export function ChartCard({
  title,
  description,
  children,
  className,
  granularity,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-5 shadow-sm",
        className
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {granularity}
      </div>
      <div className="min-h-[240px]">{children}</div>
    </div>
  );
}
