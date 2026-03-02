/**
 * 通用搜索输入框
 * 统一管理后台搜索框样式与行为
 */

"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** 输入框最小宽度，默认 200px */
  minWidth?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "搜索...",
  className = "",
  minWidth = "min-w-[200px]",
}: SearchInputProps) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-3 h-4 w-4 text-gray-500 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 py-2 text-sm",
          "placeholder:text-gray-400 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
          minWidth
        )}
      />
    </div>
  );
}
