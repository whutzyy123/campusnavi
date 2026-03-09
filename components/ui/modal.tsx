"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

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
  /** 内容容器额外 class（如 max-w-md、max-w-lg） */
  containerClassName?: string;
  /** 遮罩层额外 class（如 z-[200] 覆盖高层级元素） */
  overlayClassName?: string;
  /** 内容区额外 class（如 z-[210]） */
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

  const content = (
    <>
      {/* 遮罩：覆盖整个视口，使用 z-modal-overlay 确保高于 Sidebar */}
      <div
        className={`fixed inset-0 z-modal-overlay bg-black/50 modal-overlay ${overlayClassName}`.trim()}
        onClick={closeOnOverlayClick ? onClose : undefined}
        role="presentation"
      >
        {/* 弹窗内容：z-modal-content 确保在遮罩之上，阻止点击冒泡 */}
        <div
          className={`modal-container z-modal-content relative ${containerClassName} ${contentClassName}`.trim()}
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
