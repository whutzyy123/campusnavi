"use client";

import Link from "next/link";
import { X, ExternalLink, MapPin } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { ActivityWithPOI } from "@/types/activity";

/** 活动详情弹窗所需的最小数据（兼容无 poi 的旧数据） */
export type ActivityDetailData = Pick<
  ActivityWithPOI,
  "id" | "title" | "description" | "link" | "startAt" | "endAt"
> & { poi?: ActivityWithPOI["poi"] };

interface ActivityDetailModalProps {
  activity: ActivityDetailData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityDetailModal({ activity, isOpen, onClose }: ActivityDetailModalProps) {
  if (!isOpen || !activity) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      elevation="elevated"
      containerClassName="max-w-[500px]"
    >
      <div className="modal-header flex shrink-0 flex-row items-start justify-between gap-4 px-6 py-4">
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

      <div className="modal-body min-h-0 overflow-y-auto px-6 py-4 scrollbar-gutter-stable">
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
          {activity.poi && (
            <Link
              href={`/?poiId=${activity.poi.id}`}
              onClick={onClose}
              className="mb-4 inline-flex items-center gap-2 text-sm text-[#7C7C7C] transition-colors hover:text-[#FF4500]"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[#FF4500]" />
              At: {activity.poi.name}
              {activity.poi.address && ` · ${activity.poi.address}`}
            </Link>
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
    </Modal>
  );
}
