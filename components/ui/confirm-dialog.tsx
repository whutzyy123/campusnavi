"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, type ModalElevation } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/core/utils";

export type ConfirmVariant = "default" | "danger";

export interface OpenConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** 地图页等已开 elevated Modal 时，确认框须同为 elevated */
  elevation?: ModalElevation;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

type ConfirmState = OpenConfirmOptions | null;

let dispatchConfirm: ((state: ConfirmState) => void) | null = null;

/**
 * 命令式打开确认弹窗（须在根 layout 挂载 ConfirmDialogProvider）
 * 移动端以 ActionSheet 底栏呈现，桌面端为居中 Modal
 */
export function openConfirm(options: OpenConfirmOptions) {
  if (!dispatchConfirm && process.env.NODE_ENV !== "production") {
    console.warn("[openConfirm] ConfirmDialogProvider 未挂载，确认框未显示");
  }
  dispatchConfirm?.(options);
}

/**
 * 返回 Promise 的确认框，适用于需 await 结果的场景（如 Modal 内删除后关闭）
 */
export function openConfirmAsync(
  options: Omit<OpenConfirmOptions, "onConfirm" | "onCancel"> & {
    onConfirm: () => Promise<boolean>;
  }
): Promise<boolean> {
  return new Promise((resolve) => {
    openConfirm({
      ...options,
      onConfirm: async () => {
        const ok = await options.onConfirm();
        resolve(ok);
        if (!ok) throw new Error("confirm_action_failed");
      },
      onCancel: () => resolve(false),
    });
  });
}

function ConfirmActions({
  loading,
  cancelText,
  confirmText,
  variant,
  onClose,
  onConfirm,
  layout,
}: {
  loading: boolean;
  cancelText: string;
  confirmText: string;
  variant: ConfirmVariant;
  onClose: () => void;
  onConfirm: () => void;
  layout: "modal" | "sheet";
}) {
  if (layout === "sheet") {
    return (
      <div className="flex flex-col gap-2 px-4 pb-4">
        <Button
          type="button"
          variant={variant === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
          className="w-full rounded-xl py-3"
        >
          {confirmText}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={loading}
          className="w-full rounded-xl py-3"
        >
          {cancelText}
        </Button>
      </div>
    );
  }

  return (
    <div className="modal-footer flex justify-end gap-3 border-t border-[#EDEFF1] px-6 py-4">
      <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
        {cancelText}
      </Button>
      <Button
        type="button"
        variant={variant === "danger" ? "danger" : "primary"}
        onClick={onConfirm}
        loading={loading}
      >
        {confirmText}
      </Button>
    </div>
  );
}

export function ConfirmDialogProvider() {
  const [state, setState] = useState<ConfirmState>(null);
  const [loading, setLoading] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const onCancelRef = useRef<(() => void) | undefined>(undefined);

  const dismiss = useCallback((invokeCancel: boolean) => {
    if (invokeCancel) {
      onCancelRef.current?.();
    }
    onCancelRef.current = undefined;
    setLoading(false);
    setState(null);
  }, []);

  useEffect(() => {
    dispatchConfirm = (next) => {
      onCancelRef.current?.();
      onCancelRef.current = next?.onCancel;
      setLoading(false);
      setState(next);
    };
    return () => {
      dispatchConfirm = null;
    };
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    dismiss(true);
  }, [loading, dismiss]);

  const handleConfirm = useCallback(async () => {
    if (!state) return;
    setLoading(true);
    try {
      await state.onConfirm();
      dismiss(false);
    } catch {
      // 保留弹窗，便于用户重试或取消
    } finally {
      setLoading(false);
    }
  }, [state, dismiss]);

  useEffect(() => {
    if (!state || isDesktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        dismiss(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, isDesktop, loading, dismiss]);

  if (!state) return null;

  const title = state.title;
  const description = state.description;
  const confirmText = state.confirmText ?? "确认";
  const cancelText = state.cancelText ?? "取消";
  const variant = state.variant ?? "default";
  const elevation = state.elevation ?? "default";

  const overlayZ =
    elevation === "elevated" ? "z-map-modal-overlay" : "z-modal-overlay";
  const contentZ =
    elevation === "elevated" ? "z-map-modal-content" : "z-modal-content";

  if (!isDesktop) {
    return (
      <>
        <div
          className={cn("fixed inset-0 bg-black/40", overlayZ)}
          onClick={handleClose}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className={cn(
            "fixed bottom-0 left-0 right-0 mx-auto w-full max-w-[var(--mobile-content-max)] rounded-t-2xl bg-white shadow-2xl",
            contentZ
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-12 rounded-full bg-gray-300" aria-hidden />
          </div>
          <div className="px-4 pt-2 pb-3">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-[#1A1A1B]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-sm text-[#7C7C7C]">{description}</p>
            ) : null}
          </div>
          <ConfirmActions
            loading={loading}
            cancelText={cancelText}
            confirmText={confirmText}
            variant={variant}
            onClose={handleClose}
            onConfirm={handleConfirm}
            layout="sheet"
          />
        </div>
      </>
    );
  }

  return (
    <Modal
      isOpen
      onClose={handleClose}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
      elevation={elevation}
      containerClassName="max-w-md"
    >
      <div className="modal-header px-6 py-4">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-[#1A1A1B]">
          {title}
        </h2>
      </div>
      {description ? (
        <div className="modal-body px-6 pb-2 text-sm text-[#7C7C7C]">{description}</div>
      ) : null}
      <ConfirmActions
        loading={loading}
        cancelText={cancelText}
        confirmText={confirmText}
        variant={variant}
        onClose={handleClose}
        onConfirm={handleConfirm}
        layout="modal"
      />
    </Modal>
  );
}
