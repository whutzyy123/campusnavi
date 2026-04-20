"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { X, ImageIcon, CheckCircle } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { markAsFound } from "@/lib/lost-found-actions";
import toast from "react-hot-toast";

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

/** 图片轮播：多图时横向滑动，单图时静态展示 */
function ImageCarousel({
  images,
  alt,
  unoptimized,
  className = "",
}: {
  images: string[];
  alt: string;
  unoptimized?: (src: string) => boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    const scrollLeft = el.scrollLeft;
    const width = el.clientWidth;
    const index = Math.round(scrollLeft / width);
    setActiveIndex(Math.min(index, images.length - 1));
  }, [images.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, images.length]);

  if (images.length === 0) {
    return (
      <div className={cn("flex aspect-video w-full items-center justify-center rounded-xl bg-gray-100", className)}>
        <ImageIcon className="h-12 w-12 text-gray-300" aria-hidden />
      </div>
    );
  }
  if (images.length === 1) {
    return (
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100", className)}>
        <Image
          src={images[0]}
          alt={alt}
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-cover"
          unoptimized={unoptimized?.(images[0])}
        />
      </div>
    );
  }
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100", className)}>
      <div
        ref={scrollRef}
        className="flex h-full w-full overflow-x-auto no-scrollbar snap-x snap-mandatory"
      >
        {images.map((src, i) => (
          <div key={i} className="relative h-full w-full min-w-full flex-none snap-center">
            <Image
              src={src}
              alt={`${alt} (${i + 1}/${images.length})`}
              fill
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
              unoptimized={unoptimized?.(src)}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={cn("h-1.5 w-1.5 rounded-full shadow-sm transition-opacity", i === activeIndex ? "bg-white opacity-100" : "bg-white/60")}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
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
        toast.success("已标记为已找到");
        onClose();
        onMarkAsFoundSuccess?.();
      } else {
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setIsMarking(false);
    }
  };

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
          "z-[210] relative flex flex-col overflow-hidden rounded-lg bg-white shadow-xl",
          "fixed left-[50%] top-[50%] w-[90vw] max-w-[500px] -translate-x-1/2 -translate-y-1/2 outline-none",
          "max-h-[min(85vh,calc(100vh-40px))]"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lost-found-detail-modal-title"
      >
        {/* Header */}
        <div className="modal-header flex shrink-0 flex-row items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
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

        {/* Body */}
        <div className="modal-body min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-gutter-stable">
          {/* 图片轮播 */}
          {item.images.length > 0 && (
            <div className="mb-4">
              <ImageCarousel
                images={item.images}
                alt="失物招领图片"
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
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
