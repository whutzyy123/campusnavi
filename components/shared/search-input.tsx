/**
 * 通用搜索输入框
 * 后台筛选、活动列表等场景统一使用；地图 POI 域搜索见 POISearchBar
 */

"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/core/utils";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** 输入框最小宽度，默认 200px */
  minWidth?: string;
  /** 有内容时显示清除按钮 */
  clearable?: boolean;
  /** default=管理后台；soft=活动列表等前台卡片场景 */
  variant?: "default" | "soft";
}

export function SearchInput({
  value,
  onChange,
  placeholder = "搜索...",
  className = "",
  minWidth = "min-w-[200px]",
  clearable = false,
  variant = "default",
}: SearchInputProps) {
  const hasText = value.length > 0;

  return (
    <div
      className={cn(
        "relative flex items-center",
        variant === "soft" &&
          "rounded-lg border border-[#EDEFF1] bg-white/80 backdrop-blur-sm focus-within:border-[#FF4500]/50 focus-within:ring-2 focus-within:ring-[#FF4500]/20",
        className
      )}
    >
      <Search
        className={cn(
          "absolute left-3 h-4 w-4 shrink-0 pointer-events-none",
          variant === "soft" ? "text-gray-400" : "text-gray-500"
        )}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full py-2 pl-9 text-sm placeholder:text-gray-400 focus:outline-none",
          variant === "default" &&
            "rounded-lg border border-gray-300 bg-white focus:border-[#FF4500] focus:ring-2 focus:ring-[#FF4500]/20",
          variant === "soft" && "bg-transparent",
          clearable && hasText ? "pr-10" : "pr-4",
          variant === "default" && minWidth
        )}
      />
      {clearable && hasText && (
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
