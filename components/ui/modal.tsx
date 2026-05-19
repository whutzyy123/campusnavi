"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/core/utils";

export type ModalElevation = "default" | "elevated";

export interface ModalProps {
  /** 是否显示 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 弹窗内容 */
  children: React.ReactNode;
  /** 点击遮罩是否关闭（默认 true） */
  closeOnOverlayClick?: boolean;
  /** 按 ESC 是否关闭（默认 true） */
  closeOnEscape?: boolean;
  /** default=100/110；elevated=200/210 覆盖地图抽屉 */
  elevation?: ModalElevation;
  /** 内容容器额外 class（如 max-w-md、max-w-lg） */
  containerClassName?: string;
  /** 遮罩层额外 class */
  overlayClassName?: string;
  /** 内容区额外 class */
  contentClassName?: string;
}

/**
 * 基础 Modal 组件：通过 Portal 渲染到 document.body，
 * 确保遮罩覆盖 Sidebar、Header、主内容区，实现全屏遮罩效果。
 */
export function Modal({
  isOpen,
  onClose,
  children,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  elevation = "default",
  containerClassName = "",
  overlayClassName = "",
  contentClassName = "",
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") onClose();
    },
    [onClose, closeOnEscape]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const overlayZ =
    elevation === "elevated" ? "z-map-modal-overlay" : "z-modal-overlay";
  const contentZ =
    elevation === "elevated" ? "z-map-modal-content" : "z-modal-content";

  const content = (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/50 modal-overlay",
          overlayZ,
          overlayClassName
        )}
        onClick={closeOnOverlayClick ? onClose : undefined}
        role="presentation"
      >
        <div
          className={cn(
            "modal-container relative",
            contentZ,
            containerClassName,
            contentClassName
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {children}
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
