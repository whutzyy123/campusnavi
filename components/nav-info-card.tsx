/**
 * 导航信息卡片组件
 * 显示在屏幕底部，展示导航信息
 * 移动端：16:9 仅 Dist|Time|Exit；21:9+ 支持路线详情折叠；100dvh 适配
 */

"use client";

import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNavigationStore } from "@/store/use-navigation-store";
import { motion, AnimatePresence } from "framer-motion";

export function NavInfoCard() {
  const { isNavigating, routeInfo, routeSteps, endPoint, navMode, stopNavigation } = useNavigationStore();
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const isLongScreen = useMediaQuery("(min-aspect-ratio: 2/1)"); // 21:9+
  const [showRouteDetail, setShowRouteDetail] = useState(false);

  if (!isNavigating || !routeInfo || !endPoint) {
    return null;
  }

  const formatDistanceShort = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };
  const formatDurationShort = (minutes: number): string => {
    if (minutes < 1) return "<1min";
    return `${Math.round(minutes)}min`;
  };
  const formatDistanceLong = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} 米`;
    return `${(meters / 1000).toFixed(1)} 公里`;
  };
  const formatDurationLong = (minutes: number): string => {
    if (minutes < 1) return "不到 1 分钟";
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
          className={`fixed left-0 right-0 z-50 md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2 md:px-4 ${
            isMobile ? "bottom-0" : "bottom-6"
          }`}
          style={
            isMobile
              ? { paddingBottom: "env(safe-area-inset-bottom, 1rem)" }
              : undefined
          }
        >
          <div
            className={`rounded-t-2xl border-t border-x border-gray-200 bg-white/80 backdrop-blur-lg md:rounded-lg md:border md:bg-white/95 md:shadow-xl ${
              isMobile ? "mx-auto max-w-[var(--mobile-content-max)] px-4 py-3 shadow-none" : "p-4 shadow-lg"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              {isMobile ? (
                <>
                  {/* 移动端：目的地 + 距离|时间，信息更完整 */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      前往 {endPoint.name || "目标点"}
                    </div>
                    <div className="mt-0.5 flex items-center justify-center gap-2 text-xs text-gray-600">
                      <span>{formatDistanceShort(routeInfo.distance)}</span>
                      <span>·</span>
                      <span>{formatDurationShort(routeInfo.duration)}</span>
                      {isLongScreen && routeSteps && routeSteps.length > 0 && (
                        <button
                          onClick={() => setShowRouteDetail((v) => !v)}
                          className="ml-1 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-gray-500 active:bg-gray-100"
                        >
                          详情
                          <ChevronDown className={`h-3 w-3 transition-transform ${showRouteDetail ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900">
                    {navMode === "ride" ? "骑行" : "步行"}前往 {endPoint.name || "目标点"}
                  </h3>
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                    <span>距离约 {formatDistanceLong(routeInfo.distance)}</span>
                    <span>预计 {formatDurationLong(routeInfo.duration)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={stopNavigation}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600 active:scale-95 disabled:opacity-50"
                title="结束导航"
                aria-label="结束导航"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 移动端：底部强调条，呼应高德地图的距离/时间提示 */}
            {isMobile && (
              <div className="mt-2 rounded-xl bg-[#FFF2E8] px-3 py-1.5 text-xs font-medium text-[#D4380D] flex items-center justify-between">
                <span>距离约 {formatDistanceLong(routeInfo.distance)}</span>
                <span>预计 {formatDurationLong(routeInfo.duration)}</span>
              </div>
            )}

            {/* 21:9+ 路线详情展开 */}
            {isMobile && isLongScreen && showRouteDetail && routeSteps && routeSteps.length > 0 && (
              <div className="mt-2 max-h-[min(25dvh,180px)] overflow-y-auto border-t border-gray-100 pt-2 text-[11px] text-gray-600 no-scrollbar">
                {routeSteps.map((step, idx) => (
                  <div key={idx} className="flex gap-2 py-0.5">
                    <span className="shrink-0 text-gray-400">{idx + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-800">{step.instruction}</div>
                      {step.distance > 0 && (
                        <div className="text-[10px] text-gray-500">
                          约 {formatDistanceShort(step.distance)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

