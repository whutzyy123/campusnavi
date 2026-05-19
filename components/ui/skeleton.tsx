import { cn } from "@/lib/core/utils";

/** 内联占位块（列表卡片、详情字段等）；整页加载请用 PageLoading */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded", className)} aria-hidden />;
}
