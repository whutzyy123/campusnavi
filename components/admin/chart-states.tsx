"use client";

import { BarChart3 } from "lucide-react";

/** 图表加载状态 */
export function ChartLoadingState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      <span className="text-sm">加载数据中…</span>
    </div>
  );
}

/** 图表空状态 */
export function ChartEmptyState({ message = "暂无数据" }: { message?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
      <BarChart3 className="h-12 w-12" strokeWidth={1.5} />
      <span className="text-sm">{message}</span>
    </div>
  );
}
