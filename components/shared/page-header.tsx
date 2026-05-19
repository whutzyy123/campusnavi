"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/core/utils";

export interface PageHeaderProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  rightSlot?: ReactNode;
  className?: string;
  onBack?: () => void;
}

export function PageHeader({
  title,
  backHref,
  backLabel = "返回",
  rightSlot,
  className,
  onBack,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (backHref) {
      router.push(backHref);
      return;
    }
    router.back();
  };

  return (
    <>
      <div className="h-[3px] bg-gradient-to-r from-[#FF4500] to-[#FF6B3D]" />
      <div className={cn("border-b border-[#EDEFF1] bg-white shadow-sm", className)}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 rounded-full border border-[#EDEFF1] bg-white px-3 py-1.5 text-sm font-medium text-[#FF4500] transition-colors hover:border-[#FF4500] hover:bg-[#FFF7F5]"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLabel}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[#1A1A1B]">{title}</h1>
          </div>
          {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        </div>
      </div>
    </>
  );
}

export interface PageHeaderLayoutProps {
  header: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

/** 带子页头部的标准内容区（max-w-2xl + padding） */
export function PageHeaderLayout({ header, children, contentClassName }: PageHeaderLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F6F7F8]">
      {header}
      <div className={cn("mx-auto max-w-2xl px-4 py-6 pb-24", contentClassName)}>{children}</div>
    </div>
  );
}
