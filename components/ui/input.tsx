"use client";

import { cn } from "@/lib/core/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export function Input({ hasError = false, className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
        hasError ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-[#FF4500]",
        className
      )}
    />
  );
}

