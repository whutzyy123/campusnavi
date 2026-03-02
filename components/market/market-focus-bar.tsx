"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ArrowLeft } from "lucide-react";
import { useMarketStore } from "@/store/use-market-store";
import { useSchoolStore } from "@/store/use-school-store";

/**
 * 集市 Focus Mode 浮动条
 * 当 focusMode 为 true 时显示，提供「返回详情」按钮
 */
export function MarketFocusBar() {
  const focusMode = useMarketStore((s) => s.focusMode);
  const selectedItemTitle = useMarketStore((s) => s.selectedItemTitle);
  const setFocusMode = useMarketStore((s) => s.setFocusMode);

  const handleBack = () => {
    setFocusMode(false);
    // 使用 getState 确保立即清除地图高亮，避免脉动残留
    const school = useSchoolStore.getState();
    school.setHighlightPoi(null);
    school.setHighlightSubPOI(null);
    school.clearSelection();
  };

  return (
    <AnimatePresence>
      {focusMode && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-md"
        >
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <MapPin className="h-5 w-5 shrink-0 text-[#FF4500]" />
              <span className="truncate text-sm font-medium text-[#1A1A1B]">
                查看位置：{selectedItemTitle || "商品"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleBack}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E03D00]"
            >
              <ArrowLeft className="h-4 w-4" />
              返回详情
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
