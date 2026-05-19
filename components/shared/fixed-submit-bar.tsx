"use client";

import { cn } from "@/lib/core/utils";
import { Button } from "@/components/ui/button";

export interface FixedSubmitBarProps {
  form?: string;
  type?: "submit" | "button";
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  buttonClassName?: string;
  /** 是否抬升到底 Tab 之上（根 layout 含 BottomTabBar 时为 true） */
  aboveTabBar?: boolean;
}

/**
 * 长表单页底栏固定主按钮，含 safe-area 与 backdrop blur
 */
export function FixedSubmitBar({
  form,
  type = "submit",
  onClick,
  loading,
  disabled,
  children,
  className,
  buttonClassName,
  aboveTabBar = true,
}: FixedSubmitBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 z-map-control border-t border-[#EDEFF1] bg-white/95 px-4 py-3 backdrop-blur-sm",
        aboveTabBar
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-14"
          : "bottom-0",
        className
      )}
      style={
        aboveTabBar
          ? undefined
          : { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }
      }
    >
      <Button
        type={type}
        form={form}
        onClick={onClick}
        loading={loading}
        disabled={disabled}
        className={cn(
          "mx-auto w-full max-w-2xl rounded-xl py-3 text-sm font-semibold shadow-md shadow-[#FF4500]/20 hover:shadow-lg hover:shadow-[#FF4500]/30 active:scale-[0.98] disabled:shadow-none",
          buttonClassName
        )}
      >
        {children}
      </Button>
    </div>
  );
}

/** 使用 FixedSubmitBar 时，页面内容区建议追加的 bottom padding */
export const FIXED_SUBMIT_BAR_CONTENT_PADDING =
  "pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:pb-32";
