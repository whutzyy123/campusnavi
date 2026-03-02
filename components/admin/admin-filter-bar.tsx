"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface AdminFilterBarProps {
  /** 搜索框（可选），父组件需使用 useDebounce */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** 筛选下拉框列表 */
  filters: Array<{
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
    label: string;
    className?: string;
  }>;
  className?: string;
}

/**
 * 管理后台统一筛选栏：搜索框 + 分类/状态下拉
 */
export function AdminFilterBar({ search, filters, className }: AdminFilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        className
      )}
    >
      {search && (
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "搜索..."}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 pl-9 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
          />
        </div>
      )}
      {filters.map((f) => (
        <div key={f.label} className="flex items-center gap-2">
          <label className="text-sm text-gray-600">{f.label}：</label>
          <select
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className={cn(
              "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
              f.className
            )}
          >
            {f.options.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
