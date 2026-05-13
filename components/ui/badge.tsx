"use client";

import { cn } from "@/lib/core/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

const variantClass: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", variantClass[variant], className)}>{children}</span>;
}

