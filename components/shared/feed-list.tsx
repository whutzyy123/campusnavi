"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { PageError } from "@/components/ui/page-state";

export interface FeedListProps<T> {
  items: T[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  renderItem: (item: T) => React.ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  renderSkeleton?: () => React.ReactNode;
  skeletonCount?: number;
  empty: React.ReactNode;
  loadMoreLabel?: string;
  loadingMoreLabel?: string;
  className?: string;
  listClassName?: string;
}

/**
 * 通用 Feed 列表壳：错误 / Skeleton 首屏 / 空态 / 列表 + 加载更多
 */
export function FeedList<T>({
  items,
  isLoading,
  isLoadingMore = false,
  error,
  hasMore = false,
  onLoadMore,
  onRetry,
  renderItem,
  getItemKey,
  renderSkeleton,
  skeletonCount = 4,
  empty,
  loadMoreLabel = "加载更多",
  loadingMoreLabel = "加载中...",
  className,
  listClassName,
}: FeedListProps<T>) {
  if (error) {
    return (
      <PageError
        description={error}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  if (isLoading && items.length === 0) {
    if (renderSkeleton) {
      return (
        <div className={cn("space-y-3", className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i}>{renderSkeleton()}</div>
          ))}
        </div>
      );
    }
    return null;
  }

  if (items.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("space-y-3", listClassName)}>
        {items.map((item, index) => (
          <div key={getItemKey ? getItemKey(item, index) : index}>
            {renderItem(item)}
          </div>
        ))}
      </div>

      {hasMore && onLoadMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 rounded-xl border border-[#EDEFF1] bg-white px-6 py-2.5 text-sm font-medium text-[#FF4500] shadow-sm transition-all hover:bg-[#FFE5DD] active:scale-[0.98] disabled:opacity-50"
          >
            {isLoadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isLoadingMore ? loadingMoreLabel : loadMoreLabel}
          </button>
        </div>
      )}
    </div>
  );
}
