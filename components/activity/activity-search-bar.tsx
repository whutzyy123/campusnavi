"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivitySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function ActivitySearchBar({
  value,
  onChange,
  placeholder = "搜索活动标题...",
  className,
}: ActivitySearchBarProps) {
  const hasText = value.length > 0;

  return (
    <div
      className={cn(
        "relative flex items-center rounded-lg border border-[#EDEFF1] bg-white/80 backdrop-blur-sm",
        "focus-within:border-[#FF4500]/50 focus-within:ring-2 focus-within:ring-[#FF4500]/20",
        className
      )}
    >
      <Search className="absolute left-3 h-4 w-4 shrink-0 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full bg-transparent py-2 pl-10 text-sm placeholder:text-gray-400",
          "focus:outline-none",
          hasText ? "pr-10" : "pr-4"
        )}
      />
      {hasText && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="清除"
          className="absolute right-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
