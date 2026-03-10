"use client";

import { useState, useEffect, useRef } from "react";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useFilterStore } from "@/store/use-filter-store";
import { useSchoolStore } from "@/store/use-school-store";

interface CategoryItem {
  id: string;
  name: string;
  icon?: string | null;
}

interface GroupedCategories {
  [key: string]: CategoryItem[];
  regular: CategoryItem[];
  convenience: CategoryItem[];
}

interface POIFilterPanelProps {
  /** 学校 ID，无学校时不渲染 */
  schoolId: string | null;
  className?: string;
}

/**
 * 地图 POI 分类筛选面板
 * 浮动于地图之上，支持常规分类与便民公共设施的分组勾选
 */
export function POIFilterPanel({ schoolId, className }: POIFilterPanelProps) {
  const { activeSchool } = useSchoolStore();
  const { selectedCategoryIds, toggleCategory, setAllCategories } = useFilterStore();

  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState<GroupedCategories>({
    regular: [],
    convenience: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const effectiveSchoolId = schoolId || activeSchool?.id;

  // 加载分类列表
  useEffect(() => {
    if (!effectiveSchoolId) {
      setCategories({ regular: [], convenience: [] });
      setHasInitialized(false);
      return;
    }

    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const { getCategoriesForFilter } = await import("@/lib/category-actions");
        const result = await getCategoriesForFilter(effectiveSchoolId);
        if (result.success && result.data) {
          const { regular = [], convenience = [] } = result.data;
          setCategories({ regular, convenience });
        }
      } catch (error) {
        console.error("获取分类列表失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, [effectiveSchoolId]);

  // 初始化：加载完成后全选
  useEffect(() => {
    if (isLoading || hasInitialized || !effectiveSchoolId) return;

    const allIds = [...categories.regular, ...categories.convenience].map((c) => c.id);
    if (allIds.length > 0) {
      setAllCategories(allIds);
      setHasInitialized(true);
    }
  }, [categories, isLoading, effectiveSchoolId, hasInitialized, setAllCategories]);

  // 切换学校时重置（由父组件/Navbar 调用 resetFilters，此处仅清空 hasInitialized 以便重新初始化）
  useEffect(() => {
    if (!effectiveSchoolId) {
      setHasInitialized(false);
    }
  }, [effectiveSchoolId]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allIds = [...(categories.regular ?? []), ...(categories.convenience ?? [])].map((c) => c.id);

  const handleSelectAll = () => {
    setAllCategories(allIds);
  };

  const handleClearAll = () => {
    setAllCategories([]);
  };

  if (!effectiveSchoolId) return null;

  return (
    <div ref={panelRef} className={`absolute top-4 right-4 z-30 ${className ?? ""}`}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg bg-white/95 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-md transition-all hover:bg-gray-50 border border-gray-200"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Filter className="h-4 w-4 text-gray-600" />
        <span>分类筛选</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {/* 筛选面板 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="max-h-[60vh] overflow-y-auto no-scrollbar p-4">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">加载中...</div>
            ) : allIds.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">暂无分类</div>
            ) : (
              <div className="space-y-4">
                {/* 快捷操作 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    清空
                  </button>
                </div>

                {/* 常规分类：移动端横向滚动，桌面端垂直列表 */}
                {categories.regular.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      常规分类
                    </div>
                    <div className="flex flex-row flex-nowrap md:flex-col overflow-x-auto md:overflow-x-visible no-scrollbar snap-x snap-mandatory md:snap-none gap-2 space-x-3 md:space-x-0 md:gap-1.5 px-4 md:px-0 -mx-2 md:mx-0">
                      {categories.regular.map((cat) => (
                        <label
                          key={cat.id}
                          className="flex flex-none snap-center md:snap-align-none md:flex-initial cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50 md:w-full"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCategoryIds.includes(cat.id)}
                            onChange={() => toggleCategory(cat.id)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-[#FF4500] focus:ring-[#FF4500]/20"
                          />
                          <span className="text-sm text-gray-800 whitespace-nowrap md:whitespace-normal">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* 便民公共设施：移动端横向滚动，桌面端垂直列表 */}
                {categories.convenience.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      便民公共设施
                    </div>
                    <div className="flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible no-scrollbar snap-x snap-mandatory md:snap-none gap-2 space-x-3 md:space-x-0 md:space-y-1.5 px-1 md:px-0 -mx-1 md:mx-0">
                      {categories.convenience.map((cat) => (
                        <label
                          key={cat.id}
                          className="flex flex-none snap-center md:snap-align-none cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50 md:w-full"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCategoryIds.includes(cat.id)}
                            onChange={() => toggleCategory(cat.id)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-[#FF4500] focus:ring-[#FF4500]/20"
                          />
                          <span className="text-sm text-gray-800 whitespace-nowrap md:whitespace-normal">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
