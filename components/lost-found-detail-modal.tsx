"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle } from "lucide-react";
import { formatRelativeTime } from "@/lib/core/utils";
import { markAsFound } from "@/lib/actions/lost-found";
import { Modal } from "@/components/ui/modal";
import { ImageCarousel } from "@/components/shared/image-carousel";
import { notify } from "@/lib/ui/notify";

/** 失物招领详情项（与 getActiveLostFoundByPoi 返回结构一致） */
export interface LostFoundEventWithRelations {
  id: string;
  description: string;
  images: string[];
  contactInfo: string | null;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null };
}

interface LostFoundDetailModalProps {
  item: LostFoundEventWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: { id: string; role?: string } | null;
  /** 标记为已找到成功后的回调（用于刷新列表） */
  onMarkAsFoundSuccess?: () => void;
}

/**
 * 失物招领详情弹窗
 * Portal 渲染到 document.body，z-[200]/z-[210] 确保覆盖抽屉
 */
export function LostFoundDetailModal({
  item,
  isOpen,
  onClose,
  currentUser,
  onMarkAsFoundSuccess,
}: LostFoundDetailModalProps) {
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [isMarking, setIsMarking] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowContactInfo(false);
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleMarkAsFound = async () => {
    setIsMarking(true);
    try {
      const result = await markAsFound(item.id);
      if (result.success) {
        notify.success("已标记为已找到");
        onClose();
        onMarkAsFoundSuccess?.();
      } else {
        notify.error(result.error ?? "操作失败");
      }
    } catch {
      notify.error("操作失败，请重试");
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      elevation="elevated"
      containerClassName="max-w-[500px]"
    >
      <div className="modal-header flex shrink-0 flex-row items-start justify-between gap-4 px-6 py-4">
          <h3
            id="lost-found-detail-modal-title"
            className="min-w-0 flex-1 pr-8 text-lg font-bold text-[#1A1A1B]"
          >
            失物招领详情
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

        {/* 主体 */}
        <div className="modal-body min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-gutter-stable">
          {/* 图片轮播 */}
          {item.images.length > 0 && (
            <div className="mb-4">
              <ImageCarousel
                images={item.images}
                altPrefix="失物招领图片"
                unoptimized={(src) => src.startsWith("blob:")}
              />
            </div>
          )}

          <p className="mb-4 w-full break-words whitespace-pre-wrap text-sm text-gray-700">
            {item.description}
          </p>

          {/* 元数据 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">
              {formatRelativeTime(item.createdAt)}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              进行中
            </span>
          </div>

          {/* 联系方式（隐私保护）：仅非发布者可见「是我的/我捡到了」按钮 */}
          {currentUser?.id !== item.user.id && (
            <div className="mt-4">
              {!showContactInfo ? (
                <button
                  type="button"
                  onClick={() => setShowContactInfo(true)}
                  className="w-full rounded-lg border border-[#FF4500] bg-white px-4 py-2.5 text-sm font-medium text-[#FF4500] transition-colors hover:bg-[#FF4500]/5"
                >
                  是我的/我捡到了
                </button>
              ) : item.contactInfo ? (
                <div className="rounded-xl bg-gray-100 p-4">
                  <p className="text-xs font-medium text-gray-500">联系方式</p>
                  <p className="mt-1 text-sm text-gray-800">{item.contactInfo}</p>
                </div>
              ) : (
                <p className="rounded-xl bg-gray-100 p-4 text-sm text-gray-600">
                  未提供联系方式
                </p>
              )}
            </div>
          )}

          {/* 发布者或管理员可标记为已找到 */}
          {(currentUser?.id === item.user.id ||
            currentUser?.role === "SUPER_ADMIN" ||
            currentUser?.role === "ADMIN") && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleMarkAsFound}
                disabled={isMarking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isMarking ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                已找到
              </button>
            </div>
          )}
      </div>
    </Modal>
  );
}
