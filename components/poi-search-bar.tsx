/**
 * POI 搜索条组件
 * 用于在首页搜索 POI
 */

"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import type { POIWithStatus } from "@/lib/poi-utils";

interface POISearchBarProps {
  pois: POIWithStatus[];
  onSelectPOI: (poi: POIWithStatus) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function POISearchBar({ pois, onSelectPOI, isOpen, onClose }: POISearchBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // 过滤 POI
  const filteredPOIs = pois.filter((poi) =>
    poi.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    poi.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed left-1/2 top-20 z-40 -translate-x-1/2 w-full max-w-md px-4">
      <div className="rounded-lg bg-white/95 backdrop-blur-md shadow-xl border border-white/20">
        {/* 搜索输入框 */}
        <div className="flex items-center gap-2 p-3">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="搜索 POI..."
            className="flex-1 border-0 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setIsFocused(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* 搜索结果列表 */}
        {(searchQuery || isFocused) && (
          <div className="max-h-64 overflow-y-auto border-t border-gray-200">
            {filteredPOIs.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                未找到相关 POI
              </div>
            ) : (
              filteredPOIs.map((poi) => (
                <button
                  key={poi.id}
                  onClick={() => {
                    onSelectPOI(poi);
                    setSearchQuery("");
                    setIsFocused(false);
                  }}
                  className="w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 last:border-0"
                >
                  <div className="font-medium text-gray-900">{poi.name}</div>
                  <div className="text-xs text-gray-500">{poi.category}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

