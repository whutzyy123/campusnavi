"use client";

import { cn } from "@/lib/core/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded bg-gray-200", className)} />;
}

