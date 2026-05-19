"use client";

import { SearchInput } from "@/components/shared/search-input";
import { cn } from "@/lib/core/utils";

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
      {search ? (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? "搜索..."}
          clearable
          className="min-w-[200px] flex-1"
        />
      ) : null}
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
