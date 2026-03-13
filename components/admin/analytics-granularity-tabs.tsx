"use client";

import { cn } from "@/lib/utils";

export type Granularity = 7 | 30;

interface AnalyticsGranularityTabsProps {
  value: Granularity;
  onChange: (v: Granularity) => void;
  className?: string;
}

/**
 * 7天/30天时间粒度切换
 */
export function AnalyticsGranularityTabs({
  value,
  onChange,
  className,
}: AnalyticsGranularityTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5",
        className
      )}
    >
      {([7, 30] as const).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === d
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          近{d}天
        </button>
      ))}
    </div>
  );
}
