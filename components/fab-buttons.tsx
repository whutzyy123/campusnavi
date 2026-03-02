/**
 * 移动端悬浮操作按钮 (FAB)
 * 用于首页地图的快速操作
 */

"use client";

import { useState } from "react";
import { Navigation, MapPin, Search, X } from "lucide-react";

interface FABButtonsProps {
  onLocate: () => void;
  onSchoolSelect: () => void;
  onSearch: () => void;
  isLocating?: boolean;
}

export function FABButtons({ onLocate, onSchoolSelect, onSearch, isLocating = false }: FABButtonsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* 主 FAB 按钮 */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed bottom-6 right-6 z-navbar-dropdown flex h-14 w-14 items-center justify-center rounded-full bg-[#FF4500] text-white shadow-lg transition-opacity hover:opacity-90 active:scale-95"
      >
        {menuOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Navigation className="h-6 w-6" />
        )}
      </button>

      {/* 子菜单按钮 */}
      {menuOpen && (
        <>
          {/* 定位按钮 */}
          <button
            onClick={() => {
              onLocate();
              setMenuOpen(false);
            }}
            disabled={isLocating}
            className="fixed bottom-32 right-6 z-navbar-dropdown flex h-12 w-12 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm text-[#FF4500] shadow-lg transition-all hover:bg-[#FFE5DD] active:scale-95 disabled:opacity-50"
            title="定位"
          >
            {isLocating ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent"></div>
            ) : (
              <Navigation className="h-5 w-5" />
            )}
          </button>

          {/* 学校切换按钮 */}
          <button
            onClick={() => {
              onSchoolSelect();
              setMenuOpen(false);
            }}
            className="fixed bottom-20 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm text-[#FF4500] shadow-lg transition-all hover:bg-[#FFE5DD] active:scale-95"
            title="切换学校"
          >
            <MapPin className="h-5 w-5" />
          </button>

          {/* 搜索按钮 */}
          <button
            onClick={() => {
              onSearch();
              setMenuOpen(false);
            }}
            className="fixed bottom-44 right-6 z-navbar-dropdown flex h-12 w-12 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm text-[#FF4500] shadow-lg transition-all hover:bg-[#FFE5DD] active:scale-95"
            title="搜索 POI"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-navbar bg-black/20"
            onClick={() => setMenuOpen(false)}
          />
        </>
      )}
    </>
  );
}

