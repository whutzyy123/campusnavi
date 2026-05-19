"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/core/utils";

const maxWidthClass = {
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
} as const;

export type StudentPageShellMaxWidth = keyof typeof maxWidthClass;

export interface StudentPageShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  maxWidth?: StudentPageShellMaxWidth;
  /** default：标准列表页；fullHeight：消息等全高 flex 列布局 */
  variant?: "default" | "fullHeight";
  className?: string;
  contentClassName?: string;
}

export function StudentPageShell({
  children,
  title,
  subtitle,
  headerRight,
  maxWidth = "2xl",
  variant = "default",
  className,
  contentClassName,
}: StudentPageShellProps) {
  if (variant === "fullHeight") {
    return (
      <div className={cn("flex min-h-[calc(100vh-64px)] flex-col bg-[#F6F7F8]", className)}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("min-h-[calc(100vh-64px)] bg-[#F6F7F8]", className)}>
      <div className={cn("mx-auto px-4 py-6 pb-24", maxWidthClass[maxWidth], contentClassName)}>
        {(title || headerRight) && (
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              {title ? <h1 className="text-2xl font-bold text-[#1A1A1B]">{title}</h1> : null}
              {subtitle ? <p className="mt-1 text-sm text-[#7C7C7C]">{subtitle}</p> : null}
            </div>
            {headerRight}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
