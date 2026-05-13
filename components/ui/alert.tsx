"use client";

import { cn } from "@/lib/core/utils";

type AlertVariant = "info" | "success" | "warning" | "error";

const variantClass: Record<AlertVariant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Alert({ variant = "info", title, children, className }: AlertProps) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", variantClass[variant], className)}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

