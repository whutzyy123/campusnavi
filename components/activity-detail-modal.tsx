"use client";

import { createPortal } from "react-dom";
import { X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityDetailData {
  id: string;
  title: string;
  description: string;
  link: string | null;
  startAt: string;
  endAt: string;
}

interface ActivityDetailModalProps {
  activity: ActivityDetailData | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 活动详情弹窗 - 复用 UserProfileModal 的成功结构：Portal + 严格居中
 */
export function ActivityDetailModal({ activity, isOpen, onClose }: ActivityDetailModalProps) {
  if (!isOpen || !activity) return null;

  const content = (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center p-4",
        "bg-black/50"
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "z-[210] relative flex flex-col overflow-hidden rounded-lg bg-white p-6 shadow-xl",
          "fixed left-[50%] top-[50%] w-[90vw] max-w-[500px] -translate-x-1/2 -translate-y-1/2 outline-none",
          "max-h-[85vh]"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-modal-title"
      >
        {/* Header - 关闭按钮在右上角 */}
        <div className="flex shrink-0 flex-row items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <h3
            id="activity-detail-modal-title"
            className="min-w-0 flex-1 pr-8 text-lg font-bold text-[#1A1A1B]"
          >
            {activity.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body - 可滚动，长描述不溢出 */}
        <div className="min-h-0 flex-1 overflow-y-auto pt-4 scrollbar-gutter-stable">
          <div className="mb-4 text-sm text-gray-500">
            {(() => {
              const start = new Date(activity.startAt);
              const end = new Date(activity.endAt);
              return `${start.toLocaleString("zh-CN", {
                month: "2-digit",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} - ${end.toLocaleString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}`;
            })()}
          </div>
          {activity.description && (
            <p className="mb-4 w-full break-words whitespace-pre-wrap text-sm text-gray-700">
              {activity.description}
            </p>
          )}
          {activity.link && (
            <a
              href={activity.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" />
              查看详情
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
