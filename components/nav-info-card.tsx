/**
 * 导航信息卡片组件
 * 显示在屏幕底部，展示导航信息
 */

"use client";

import { X } from "lucide-react";
import { useNavigationStore } from "@/store/use-navigation-store";
import { motion, AnimatePresence } from "framer-motion";

export function NavInfoCard() {
  const { isNavigating, routeInfo, endPoint, stopNavigation } = useNavigationStore();

  if (!isNavigating || !routeInfo || !endPoint) {
    return null;
  }

  // 格式化距离
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} 米`;
    }
    return `${(meters / 1000).toFixed(1)} 公里`;
  };

  // 格式化时间
  const formatDuration = (minutes: number): string => {
    if (minutes < 1) {
      return "不到 1 分钟";
    }
    return `${Math.round(minutes)} 分钟`;
  };

  return (
    <AnimatePresence>
      {isNavigating && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed bottom-6 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4"
        >
          <div className="rounded-lg bg-white/95 backdrop-blur-sm shadow-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">
                  步行前往 {endPoint.name || "目标点"}
                </h3>
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                  <span>距离约 {formatDistance(routeInfo.distance)}</span>
                  <span>预计耗时 {formatDuration(routeInfo.duration)}</span>
                </div>
              </div>
              <button
                onClick={stopNavigation}
                className="ml-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
                title="结束导航"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

