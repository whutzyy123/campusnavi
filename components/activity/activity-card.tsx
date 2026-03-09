"use client";

import Link from "next/link";
import { MapPin, Map } from "lucide-react";
import type { ActivityWithPOI } from "@/types/activity";
import { formatTimeRemaining, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ActivityCardProps {
  activity: ActivityWithPOI;
  /** 可选：点击卡片主体时打开详情（View on Map 等链接已 stopPropagation，不触发） */
  onOpenDetail?: (activity: ActivityWithPOI) => void;
  /** 可选：覆盖默认跳转行为（默认跳转 /?poiId=xxx 打开地图抽屉） */
  onPoiClick?: (poiId: string) => void;
  className?: string;
}

const mapHref = (poiId: string) => `/?poiId=${poiId}`;

export function ActivityCard({ activity, onOpenDetail, onPoiClick, className }: ActivityCardProps) {
  const timeRemaining = formatTimeRemaining(activity.endAt);
  const showExactTime = timeRemaining === "即将结束" || timeRemaining === "已结束";
  const isOngoing = timeRemaining !== "已结束" && timeRemaining !== "即将结束";

  const poiLink = (
    <Link
      href={mapHref(activity.poiId)}
      onClick={(e) => {
        e.stopPropagation();
        onPoiClick?.(activity.poiId);
      }}
      className="inline-flex items-center gap-1 text-sm text-[#7C7C7C] transition-colors hover:text-[#FF4500]"
    >
      <MapPin className="h-4 w-4 shrink-0 text-[#FF4500]" />
      At: {activity.poi.name}
    </Link>
  );

  return (
    <article
      className={cn(
        "rounded-lg border border-[#EDEFF1] bg-white p-4 shadow-sm transition-all duration-200",
        "hover:border-[#FF4500]/30 hover:shadow-md hover:shadow-[#FF4500]/5",
        onOpenDetail && "cursor-pointer",
        className
      )}
      onClick={onOpenDetail ? () => onOpenDetail(activity) : undefined}
      onKeyDown={
        onOpenDetail
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenDetail(activity);
              }
            }
          : undefined
      }
      role={onOpenDetail ? "button" : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
    >
      <h3 className="font-semibold text-[#1A1A1B]">{activity.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-[#7C7C7C]">
        {activity.description || "暂无描述"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            "bg-[#FFE5DD] text-[#FF4500]"
          )}
        >
          {isOngoing && (
            <span
              className="live-pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF4500]"
              aria-hidden
            />
          )}
          {showExactTime || timeRemaining === "已结束"
            ? `结束: ${formatDateTime(activity.endAt)}`
            : `Ongoing · Ends in: ${timeRemaining}`}
        </span>

        {poiLink}

        <Link
          href={mapHref(activity.poiId)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEFF1] px-2.5 py-1 text-xs font-medium text-[#7C7C7C] transition-colors hover:border-[#FF4500]/50 hover:bg-[#FFE5DD]/50 hover:text-[#FF4500]"
        >
          <Map className="h-3.5 w-3.5" />
          View on Map
        </Link>
      </div>
    </article>
  );
}

interface ActivityListSkeletonProps {
  count?: number;
  className?: string;
}

export function ActivityListSkeleton({ count = 3, className }: ActivityListSkeletonProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-[#EDEFF1] bg-white p-4 shadow-sm"
        >
          <div className="shimmer h-5 w-3/4 rounded" />
          <div className="mt-2 space-y-1">
            <div className="shimmer h-4 w-full rounded" />
            <div className="shimmer h-4 w-4/5 rounded" />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="shimmer h-6 w-24 rounded-full" />
            <div className="shimmer h-4 w-32 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
