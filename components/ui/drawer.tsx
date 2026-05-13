"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

type DrawerSide = "left" | "right" | "bottom";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: DrawerSide;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
}

function sideClass(side: DrawerSide): string {
  if (side === "left") return "left-0 top-0 h-full w-full max-w-md";
  if (side === "right") return "right-0 top-0 h-full w-full max-w-md";
  return "bottom-0 left-0 right-0 w-full max-h-[85vh]";
}

export function Drawer({
  isOpen,
  onClose,
  children,
  side = "right",
  closeOnOverlayClick = true,
  closeOnEscape = true,
  overlayClassName = "",
  panelClassName = "",
}: DrawerProps) {
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

  return createPortal(
    <div
      className={`fixed inset-0 z-modal-overlay bg-black/50 ${overlayClassName}`.trim()}
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`fixed z-modal-content overflow-hidden border border-gray-200 bg-white shadow-xl ${sideClass(side)} ${panelClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

