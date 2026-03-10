/**
 * POI 搜索条组件
 * 嵌入 Navbar 使用，支持零态搜索历史、活动匹配展示与「正在进行」快捷筛选
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, MapPin, Clock, Flame } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { useSearchHistory } from "@/hooks/use-search-history";
import { useDebounce } from "@/hooks/use-debounce";
import { getActiveActivitiesCount } from "@/lib/activity-actions";
import type { POIWithStatus } from "@/lib/poi-utils";

const DROPDOWN_MAX_HEIGHT = "max-h-[18.5rem]";

/** 搜索 API 返回的单项（含可选 matchedActivity） */
interface SearchResultItem {
  id: string;
  name: string;
  alias: string | null;
  matchedActivity?: { id: string; title: string };
}

interface POISearchBarProps {
  pois: POIWithStatus[];
  onSelectPOI: (poi: POIWithStatus) => void;
  className?: string;
  /** 占位符，移动端建议短文本如 "搜索..." */
  placeholder?: string;
}

export function POISearchBar({ pois, onSelectPOI, className = "", placeholder = "搜索..." }: POISearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showOngoingOnly, setShowOngoingOnly] = useState(false);
  const [hasActiveActivities, setHasActiveActivities] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { activeSchool, inspectedSchool } = useSchoolStore();
  const { currentUser } = useAuthStore();
  const schoolId = (inspectedSchool ?? activeSchool)?.id ?? currentUser?.schoolId ?? null;
  const { history, addToHistory, clearHistory } = useSearchHistory(schoolId ?? "global");

  const debouncedQ = useDebounce(inputValue.trim(), 280);

  // 检查当前学校是否有进行中的活动，用于条件展示「正在进行」入口（默认 false 避免加载时布局闪烁）
  useEffect(() => {
    const sid = schoolId;
    if (!sid) {
      setHasActiveActivities(false);
      return;
    }
    let cancelled = false;
    getActiveActivitiesCount(sid).then((res) => {
      if (!cancelled && res.success && typeof res.data === "number") {
        setHasActiveActivities(res.data > 0);
      } else {
        setHasActiveActivities(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // API 搜索：关键词搜索 或 「正在进行」快捷筛选
  const fetchSearchResults = useCallback(async () => {
    if (!schoolId) return;
    if (showOngoingOnly) {
      setIsSearching(true);
      try {
        const { searchPOIs } = await import("@/lib/poi-actions");
        const result = await searchPOIs(schoolId, { ongoingOnly: true });
        if (result.success && Array.isArray(result.data)) {
          setSearchResults(result.data);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
      return;
    }
    if (!debouncedQ) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { searchPOIs } = await import("@/lib/poi-actions");
      const result = await searchPOIs(schoolId, { q: debouncedQ });
      if (result.success && Array.isArray(result.data)) {
        setSearchResults(result.data);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [schoolId, debouncedQ, showOngoingOnly]);

  useEffect(() => {
    fetchSearchResults();
  }, [fetchSearchResults]);

  // 解析完整 POI（用于 onSelectPOI）
  const resolvePOI = (item: SearchResultItem): POIWithStatus | null => {
    const full = pois.find((p) => p.id === item.id);
    return full ?? null;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectResult = (item: SearchResultItem) => {
    const poi = resolvePOI(item);
    if (!poi) return;
    const query = inputValue.trim();
    if (query) addToHistory(query);
    onSelectPOI(poi);
    setInputValue("");
    setShowOngoingOnly(false);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    if (searchResults.length > 0) {
      handleSelectResult(searchResults[0]);
    }
  };

  const showResultsDropdown = isFocused && (debouncedQ.length > 0 || showOngoingOnly) && (searchResults.length > 0 || isSearching);
  const showHistoryDropdown = isFocused && inputValue.trim().length === 0 && !showOngoingOnly && history.length > 0;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/** 输入框 */}
      <div className="relative flex items-center gap-2 md:gap-3 rounded-full border border-gray-200 bg-white px-3 md:px-4 py-2 min-h-[44px] shadow-sm transition-shadow focus-within:border-[#FF4500] focus-within:ring-2 focus-within:ring-[#FF4500]/20 focus-within:shadow-md">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 min-w-0 border-0 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
        />
        {(inputValue.length > 0 || showOngoingOnly) && (
          <button
            type="button"
            onClick={() => {
              setInputValue("");
              setShowOngoingOnly(false);
              setIsFocused(false);
            }}
            className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-[#FFE5DD]/50 hover:text-[#FF4500]"
            aria-label="清除"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/** 零态：搜索历史下拉 */}
      {showHistoryDropdown && (
        <div
          className={`absolute left-0 right-0 top-full z-tooltip-popover mt-2 ${DROPDOWN_MAX_HEIGHT} flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2">
            <span className="text-xs font-medium text-gray-500">最近搜索</span>
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs text-gray-400 transition-colors hover:text-[#FF4500]"
            >
              清空
            </button>
          </div>
          {/** 正在进行筛选快捷入口（仅当该校有进行中活动时展示） */}
          {hasActiveActivities && (
            <button
              type="button"
              onClick={() => {
                setShowOngoingOnly(true);
                setInputValue("");
              }}
              className="flex w-full cursor-pointer items-center gap-2 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-orange-50/80"
            >
              <Flame className="h-4 w-4 shrink-0 text-orange-500" />
              <span className="text-sm font-medium text-orange-700">🔥 正在进行</span>
              <span className="text-xs text-orange-600">查看有活动的 POI</span>
            </button>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto scrollbar-theme">
            {history.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => setInputValue(item)}
                  className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{item}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/** 搜索结果下拉 */}
      {showResultsDropdown && (
        <div
          className={`absolute left-0 right-0 top-full z-tooltip-popover mt-2 ${DROPDOWN_MAX_HEIGHT} flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg`}
        >
          {showOngoingOnly && (
            <div className="flex shrink-0 items-center justify-between border-b border-orange-100 bg-orange-50/50 px-4 py-2">
              <span className="text-xs font-medium text-orange-700 flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5" />
                正在进行
              </span>
              <button
                type="button"
                onClick={() => setShowOngoingOnly(false)}
                className="text-xs text-orange-600 transition-colors hover:text-orange-800"
              >
                返回搜索
              </button>
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto scrollbar-theme">
            {isSearching ? (
              <li className="px-4 py-6 text-center text-sm text-gray-500">搜索中...</li>
            ) : searchResults.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-gray-500">
                {showOngoingOnly ? "暂无进行中的活动" : "未找到匹配的 POI"}
              </li>
            ) : (
              searchResults.map((item) => {
                const isActivityMatch = !!item.matchedActivity;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectResult(item)}
                      className={`flex w-full cursor-pointer flex-col border-b border-gray-50 px-4 py-3 text-left transition-colors last:border-0 ${
                        isActivityMatch ? "hover:bg-violet-50/80" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className={`h-4 w-4 shrink-0 ${isActivityMatch ? "text-violet-500" : "text-gray-400"}`} />
                        <span className={`font-medium ${isActivityMatch ? "text-violet-900" : "text-gray-900"}`}>
                          {item.name}
                        </span>
                      </div>
                      {item.matchedActivity ? (
                        <span className="mt-0.5 text-xs text-orange-600 font-medium">
                          🔥 正在进行: {item.matchedActivity.title}
                        </span>
                      ) : (
                        <span className="mt-0.5 text-xs text-gray-500">
                          {pois.find((p) => p.id === item.id)?.category ?? item.alias ?? "—"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
