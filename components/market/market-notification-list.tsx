"use client";

import React from "react";
import { Loader2, BellDot } from "lucide-react";
import { formatRelativeTime } from "@/lib/core/utils";
import type { NotificationItem } from "@/lib/actions/notification";

export interface MarketNotificationListProps {
  notifications: NotificationItem[];
  isLoading: boolean;
  onItemClick: (n: NotificationItem) => void;
  onMarkAllRead: () => void;
  /** 外层容器 className */
  containerClassName?: string;
  /** 是否显示 header 区域 */
  showHeader?: boolean;
  /** 最大高度 */
  maxHeight?: string;
  /** 未读数量（用于 header 显示） */
  unreadCount?: number;
  /** 列表项的 className */
  itemClassName?: string;
}

export function MarketNotificationList({
  notifications,
  isLoading,
  onItemClick,
  onMarkAllRead,
  containerClassName = "",
  showHeader = true,
  maxHeight = "max-h-64",
  unreadCount = 0,
  itemClassName = "",
}: MarketNotificationListProps) {
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className={containerClassName}>
      {showHeader && (
        <div className="sticky top-0 z-10 border-b border-[#EDEFF1] bg-white/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFE5DD]/70 text-[#FF4500]">
                <BellDot className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[#1A1A1B]">交易动态</h3>
                {unreadCount > 0 ? (
                  <p className="mt-0.5 text-xs text-[#7C7C7C]">{unreadCount} 条未读</p>
                ) : (
                  <p className="mt-0.5 text-xs text-[#7C7C7C]">已全部阅读</p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-[#FF4500]/10 px-2 py-0.5 text-xs font-medium text-[#FF4500]">
                {unreadCount}
              </span>
            )}
            {hasUnread && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-medium text-[#FF4500] hover:underline"
              >
                全部标为已读
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar ${maxHeight}`}>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#7C7C7C]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#EDEFF1] bg-[#F6F7F8]/60 p-6 text-center">
            <p className="text-sm text-[#7C7C7C]">暂无交易动态</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onItemClick(n)}
                className={`relative flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all hover:border-[#FFD6C7] hover:bg-[#FFF7F4] ${
                  !n.isRead
                    ? "border-[#FFD6C7] bg-[#FFE5DD]/35"
                    : "border-[#EDEFF1] bg-white"
                } ${itemClassName}`}
              >
                {!n.isRead && (
                  <span
                    className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#FF4500]"
                    aria-label="未读"
                  />
                )}
                <p className="pr-5 text-sm leading-5 text-[#1A1A1B]">{n.message ?? "交易动态"}</p>
                <p className="text-xs text-[#7C7C7C]">{formatRelativeTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 移动端可折叠的通知列表 */
export function MarketNotificationDropdown({
  notifications,
  isLoading,
  isExpanded,
  onToggle,
  onItemClick,
  onMarkAllRead,
  unreadCount = 0,
}: {
  notifications: NotificationItem[];
  isLoading: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onItemClick: (n: NotificationItem) => void;
  onMarkAllRead: () => void;
  unreadCount?: number;
}) {
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="mt-4 pb-6 md:hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-xl border border-[#EDEFF1] bg-white px-4 py-3 text-left text-sm font-medium text-[#1A1A1B] shadow-sm"
      >
        <span className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#FFE5DD]/70 text-[#FF4500]">
            <BellDot className="h-3.5 w-3.5" />
          </span>
          交易动态
          {unreadCount > 0 && (
            <span className="h-2 w-2 rounded-full bg-[#FF4500]" aria-hidden />
          )}
        </span>
        <ChevronIcon expanded={isExpanded} />
      </button>

      {isExpanded && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#EDEFF1] bg-white p-3 shadow-sm no-scrollbar">
          {hasUnread && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="mb-2 w-full text-right text-xs font-medium text-[#FF4500] hover:underline"
            >
              全部标为已读
            </button>
          )}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-[#7C7C7C]" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#EDEFF1] bg-[#F6F7F8]/60 p-5 text-center">
              <p className="text-sm text-[#7C7C7C]">暂无交易动态</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={`relative flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all hover:border-[#FFD6C7] hover:bg-[#FFF7F4] ${
                    !n.isRead
                      ? "border-[#FFD6C7] bg-[#FFE5DD]/35"
                      : "border-[#EDEFF1] bg-white"
                  }`}
                >
                  {!n.isRead && (
                    <span
                      className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#FF4500]"
                      aria-label="未读"
                    />
                  )}
                  <p className="text-sm text-[#1A1A1B] pr-5">{n.message ?? "交易动态"}</p>
                  <p className="text-xs text-[#7C7C7C]">{formatRelativeTime(n.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <svg className="h-4 w-4 text-[#7C7C7C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-[#7C7C7C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
