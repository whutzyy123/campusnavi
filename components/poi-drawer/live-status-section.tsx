"use client";

/**
 * 实时情报区块组件
 */

import { LIVE_STATUS_BUTTONS } from "@/lib/poi-drawer/constants";
import { getStatusBadgeConfig, groupStatusesByType } from "@/lib/poi-drawer/status-utils";
import { formatRelativeTime } from "@/lib/core/utils";
import { StatusReportButton } from "./status-report-button";
import type { LiveStatusItem } from "@/lib/poi-drawer/types";

export interface LiveStatusSectionProps {
  isInCooldown: boolean;
  isLoadingLiveStatuses: boolean;
  activeLiveStatuses: LiveStatusItem[];
  reportingStatusType: string | null;
  onReportStatus: (statusType: string) => void;
  /** sub：子 POI 视图；parent：父 POI 视图（默认） */
  variant?: "sub" | "parent";
}

export function LiveStatusSection({
  isInCooldown,
  isLoadingLiveStatuses,
  activeLiveStatuses,
  reportingStatusType,
  onReportStatus,
  variant = "parent",
}: LiveStatusSectionProps) {
  const hintText = isInCooldown
    ? "感谢上报，请稍后再提交新情报..."
    : variant === "sub"
      ? "点击下方标签上报当前情况，人流情报 20 分钟有效，事件/状态 8 小时有效"
      : "点击标签上报当前情况，人流情报 20 分钟有效，事件/状态 8 小时有效";

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-[#1A1A1B]">实时情报</h3>
      <p className="mb-3 text-xs text-gray-500">{hintText}</p>
      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        {isLoadingLiveStatuses ? (
          <div className="flex justify-center py-2 text-sm text-gray-500">加载中...</div>
        ) : activeLiveStatuses.length === 0 ? (
          <p className="text-center text-sm text-gray-500">✅ 当前一切正常，暂无异常情报</p>
        ) : (
          <div className="flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible no-scrollbar snap-x snap-mandatory md:snap-none gap-2 space-x-3 md:space-x-0 px-4 md:px-0 -mx-2 md:mx-0">
            {groupStatusesByType(activeLiveStatuses).map(({ statusType, count, latestCreatedAt }) => {
              const config = getStatusBadgeConfig(statusType);
              return (
                <span
                  key={statusType}
                  className={`inline-flex flex-none snap-center items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${config.className}`}
                >
                  <span>{config.emoji}</span>
                  <span>{config.label}</span>
                  <span className="text-xs opacity-80">
                    ({count}人上报 · {formatRelativeTime(latestCreatedAt)})
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">人流状况</p>
          <div className="grid grid-cols-3 gap-2">
            {LIVE_STATUS_BUTTONS.traffic.map((btn) => (
              <StatusReportButton
                key={btn.id}
                btn={btn}
                reportingStatusType={reportingStatusType}
                isInCooldown={isInCooldown}
                onReportStatus={onReportStatus}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">事件/状态</p>
          <div className="grid grid-cols-2 gap-2">
            {LIVE_STATUS_BUTTONS.events.map((btn) => (
              <StatusReportButton
                key={btn.id}
                btn={btn}
                reportingStatusType={reportingStatusType}
                isInCooldown={isInCooldown}
                onReportStatus={onReportStatus}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}