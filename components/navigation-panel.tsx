"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDebounce } from "@/hooks/use-debounce";
import { useMediaQuery } from "@/hooks/use-media-query";
import { analytics } from "@/lib/analytics";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSchoolStore } from "@/store/use-school-store";
import { loadAMap } from "@/lib/amap-loader";
import { getPOIsBySchool } from "@/lib/poi-actions";
import { MapPin, ArrowUpDown, X, Search, ChevronDown, LocateFixed } from "lucide-react";
import toast from "react-hot-toast";

interface NavPOI {
  id: string;
  name: string;
  alias?: string | null;
  lng: number;
  lat: number;
  category: string;
}

export function NavigationPanel() {
  const {
    startPoint,
    endPoint,
    isNavigating,
    routeInfo,
    routeSteps,
    selectMode,
    setSelectMode,
    setStartPoint,
    setEndPoint,
    swapPoints,
    clearNavigation,
    startNavigation,
  } = useNavigationStore();
  const { activeSchool } = useSchoolStore();

  const [allPois, setAllPois] = useState<NavPOI[] | null>(null);
  const [isLoadingPois, setIsLoadingPois] = useState(false);

  const [searchMode, setSearchMode] = useState<"start" | "end" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [showSteps, setShowSteps] = useState(false);
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // 懒加载当前学校的 POI 列表，用于搜索
  const ensurePoisLoaded = async () => {
    if (!activeSchool || allPois) return;
    setIsLoadingPois(true);
    try {
      const result = await getPOIsBySchool(activeSchool.id);
      if (result.success && result.data?.pois) {
        const navPois: NavPOI[] = result.data.pois.map((p) => ({
          id: p.id,
          name: p.name,
          alias: (p as { alias?: string | null }).alias ?? null,
          lng: p.lng,
          lat: p.lat,
          category: p.category,
        }));
        setAllPois(navPois);
      }
    } catch (error) {
      console.error("加载导航 POI 列表失败:", error);
    } finally {
      setIsLoadingPois(false);
    }
  };

  const filteredPois = useMemo(() => {
    if (!allPois || !debouncedSearchQuery.trim()) return allPois || [];
    const q = debouncedSearchQuery.trim().toLowerCase();
    return allPois.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.alias?.toLowerCase().includes(q) ?? false)
    );
  }, [allPois, debouncedSearchQuery]);

  // 当学校变化时重置 POI 缓存
  useEffect(() => {
    setAllPois(null);
  }, [activeSchool?.id]);

  // 移动端：进入搜索模式时聚焦输入框
  useEffect(() => {
    if (isMobile && searchMode) {
      mobileSearchInputRef.current?.focus();
    }
  }, [isMobile, searchMode]);

  const shouldShowPanel = useMemo(
    () => isNavigating || !!startPoint || !!endPoint,
    [isNavigating, startPoint, endPoint]
  );

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} 米`;
    return `${(meters / 1000).toFixed(1)} 公里`;
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 1) return "不到 1 分钟";
    return `${Math.round(minutes)} 分钟`;
  };

  const handleUseMyLocation = useCallback(
    async (type: "start" | "end") => {
      const toastId = toast.loading("正在获取当前位置...");
      try {
        await loadAMap();
        const AMap = typeof window !== "undefined" ? window.AMap : null;
        if (!AMap?.Geolocation) {
          toast.error("定位服务不可用，请刷新页面重试", { id: toastId });
          return;
        }

        const geolocation = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          noIpLocate: 0,
          needAddress: false,
          convert: true,
          showButton: false,
        });

        geolocation.getCurrentPosition((status: string, result: any) => {
          if (status === "complete" && result?.position) {
            const { lng, lat } = result.position;
            const point = { lng, lat, name: "我的位置" };
            if (type === "start") {
              analytics.nav.startSet({ source: "location" });
              setStartPoint(point);
            } else {
              analytics.nav.endSet({ source: "location" });
              setEndPoint(point);
            }
            toast.success("已获取当前位置", { id: toastId });
          } else {
            const errMsg = result?.message || "定位失败";
            if (errMsg.includes("Permission Denied") || errMsg.includes("用户拒绝")) {
              toast.error("定位失败，请检查浏览器定位权限", { id: toastId });
            } else if (errMsg.includes("timeout") || errMsg.includes("超时")) {
              toast.error("定位超时，请检查网络连接", { id: toastId });
            } else {
              toast.error("定位失败，请稍后重试", { id: toastId });
            }
          }
        });
      } catch (err) {
        console.error("[handleUseMyLocation]", err);
        toast.error("定位服务加载失败，请刷新后重试", { id: toastId });
      }
    },
    [setStartPoint, setEndPoint]
  );

  const handleSelectPOI = (poi: NavPOI) => {
    if (!searchMode) return;
    if (searchMode === "start") {
      analytics.nav.startSet({ source: "panel_search", poi_id: poi.id });
      useNavigationStore.getState().setStartPoint({
        lng: poi.lng,
        lat: poi.lat,
        name: poi.name,
      });
    } else {
      analytics.nav.endSet({ source: "panel_search", poi_id: poi.id });
      useNavigationStore.getState().setEndPoint({
        lng: poi.lng,
        lat: poi.lat,
        name: poi.name,
      });
    }
    setSearchMode(null);
    setSearchQuery("");
  };

  if (!shouldShowPanel) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {/* 沉浸式地图选点模式：最小化提示条 */}
      {selectMode ? (
        <motion.div
          key="picking-bar"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto fixed left-1/2 z-navbar-dropdown flex -translate-x-1/2 items-center gap-4 rounded-full bg-gray-900 px-4 py-3 text-white shadow-2xl"
          style={{
            bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
            maxWidth: "min(calc(100vw - 2rem), var(--mobile-content-max))",
          }}
        >
          <span className="whitespace-nowrap text-sm font-medium">
            点击地图任意位置或 POI 标记选择【{selectMode === "start" ? "起点" : "终点"}】
          </span>
          <button
            onClick={() => setSelectMode(null)}
            className="min-h-[36px] min-w-[44px] rounded-full px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/20 active:bg-white/30"
          >
            取消
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="full-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto fixed left-0 right-0 z-50 w-auto md:left-4 md:right-auto md:w-96 md:rounded-xl"
          style={{
            top: isMobile ? "4rem" : "6rem",
            left: isMobile ? 0 : undefined,
            right: isMobile ? 0 : undefined,
            paddingLeft: isMobile ? "calc(0.5rem + env(safe-area-inset-left, 0px))" : undefined,
            paddingRight: isMobile ? "calc(0.5rem + env(safe-area-inset-right, 0px))" : undefined,
          }}
        >
      <div
        className={`rounded-lg border md:rounded-xl ${
          isMobile
            ? "mx-auto max-h-[30dvh] flex flex-col overflow-hidden rounded-2xl border-white/20 bg-white/70 shadow-none backdrop-blur-xl"
            : "border-gray-200 bg-white/90 shadow-lg backdrop-blur-md"
        }`}
        style={
          isMobile
            ? {
                width: "min(90vw, var(--mobile-content-max))",
                marginLeft: "auto",
                marginRight: "auto",
              }
            : undefined
        }
      >
        <div className={`flex shrink-0 items-center justify-between md:border-b md:border-gray-100 ${isMobile ? "px-3 py-2" : "px-4 py-2"}`}>
          <span className={`font-semibold text-gray-800 ${isMobile ? "text-xs" : "text-sm"}`}>校内步行导航</span>
          <button
            onClick={() => {
              analytics.nav.panelClose();
              clearNavigation();
            }}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 md:min-h-0 md:min-w-0 md:h-7 md:w-7"
            title="退出导航"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto text-gray-700 md:space-y-3 md:px-4 md:py-3 md:text-xs ${isMobile ? "space-y-2 px-2 py-1.5" : ""}`}>
          {/* 起点/终点：移动端 Floating Input Stack（单图标、搜索即输入），桌面端两列 */}
          {isMobile ? (
            <div className="relative flex flex-col gap-2">
              {/* 起点：Locate 图标内置，点击行进入搜索 */}
              <div className="relative flex h-10 items-center rounded-lg bg-white/50 pl-9 pr-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUseMyLocation("start");
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:text-[#FF4500]"
                  title="使用我的位置"
                >
                  <LocateFixed className="h-4 w-4" />
                </button>
                {searchMode === "start" ? (
                  <input
                    ref={mobileSearchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredPois.length > 0) {
                        handleSelectPOI(filteredPois[0]);
                      }
                    }}
                    placeholder="搜索地点..."
                    className="h-full w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    className="h-full w-full text-left text-sm font-medium text-gray-800"
                    onClick={async () => {
                      setSearchMode("start");
                      setSearchQuery("");
                      await ensurePoisLoaded();
                    }}
                  >
                    {startPoint?.name || "我的位置"}
                  </button>
                )}
              </div>
              {/* 交换按钮：绝对居中 */}
              <div className="flex justify-center">
                <button
                  onClick={swapPoints}
                  className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/80 shadow-sm text-gray-600 transition-colors hover:bg-white hover:text-gray-800"
                  title="交换起终点"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* 终点：Locate 图标内置 */}
              <div className="relative flex h-10 items-center rounded-lg bg-white/50 pl-9 pr-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUseMyLocation("end");
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:text-[#FF4500]"
                  title="使用我的位置"
                >
                  <LocateFixed className="h-4 w-4" />
                </button>
                {searchMode === "end" ? (
                  <input
                    ref={mobileSearchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredPois.length > 0) {
                        handleSelectPOI(filteredPois[0]);
                      }
                    }}
                    placeholder="搜索地点..."
                    className="h-full w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    className="h-full w-full text-left text-sm font-medium text-gray-800"
                    onClick={async () => {
                      setSearchMode("end");
                      setSearchQuery("");
                      await ensurePoisLoaded();
                    }}
                  >
                    {endPoint?.name || "选择终点..."}
                  </button>
                )}
              </div>
              {/* 搜索弹层：含「地图选点」链接 */}
              {searchMode && (
                <div className="mt-1 rounded-lg border border-white/30 bg-white/80 p-2 backdrop-blur-sm">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-gray-500">
                    <span>选择{searchMode === "start" ? "起点" : "终点"}</span>
                    <button
                      onClick={() => {
                        setSearchMode(null);
                        setSearchQuery("");
                      }}
                      className="text-[#FF4500]"
                    >
                      关闭
                    </button>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectMode(searchMode);
                      setSearchMode(null);
                      setSearchQuery("");
                    }}
                    className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-gray-600 hover:bg-gray-100"
                    title="点击地图任意位置或 POI 标记"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    地图选点（自由点击或选 POI）
                  </button>
                  <div className="max-h-[min(20dvh,140px)] overflow-y-auto no-scrollbar text-[11px]">
                    {isLoadingPois ? (
                      <div className="py-3 text-center text-gray-500">加载中...</div>
                    ) : filteredPois.length === 0 ? (
                      <div className="py-3 text-center text-gray-400">
                        {debouncedSearchQuery.trim() ? "无匹配结果" : "输入搜索或选择地图选点"}
                      </div>
                    ) : (
                      filteredPois.map((poi) => (
                        <button
                          key={poi.id}
                          onClick={() => handleSelectPOI(poi)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-gray-100"
                        >
                          <span className="font-medium text-gray-800">{poi.name}</span>
                          <span className="text-[10px] text-gray-500">{poi.category}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="flex flex-1 min-w-0 gap-3">
                <div className="flex flex-col items-center shrink-0 pt-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="w-px flex-1 min-h-[20px] my-0.5 border-l border-dashed border-gray-300" />
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                </div>
                <div className="flex flex-1 flex-col gap-2 min-w-0">
                  <div className="flex items-center justify-between gap-2 rounded-md bg-gray-100 p-2.5 transition-colors hover:bg-gray-200 cursor-pointer">
                    <span className="truncate text-[13px] text-gray-800 font-medium">
                      {startPoint?.name || "我的位置"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 text-gray-400">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUseMyLocation("start");
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#FF4500]"
                        title="使用我的位置"
                      >
                        <LocateFixed className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectMode("start");
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#FF4500]"
                        title="地图选点（自由点击或选 POI）"
                      >
                        <MapPin className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setSearchMode("start");
                          await ensurePoisLoaded();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#FF4500]"
                        title="搜索"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-md bg-gray-100 p-2.5 transition-colors hover:bg-gray-200 cursor-pointer">
                    <span className="truncate text-[13px] text-gray-800 font-medium">
                      {endPoint?.name || "选择终点..."}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 text-gray-400">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUseMyLocation("end");
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#FF4500]"
                        title="使用我的位置"
                      >
                        <LocateFixed className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectMode("end");
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#FF4500]"
                        title="地图选点（自由点击或选 POI）"
                      >
                        <MapPin className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setSearchMode("end");
                          await ensurePoisLoaded();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#FF4500]"
                        title="搜索"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={swapPoints}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800"
                title="交换起终点"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 路线信息（有路线时显示）- 移动端更紧凑 */}
          {routeInfo && (
            <div
              className={`flex items-center justify-between rounded-md bg-[#FFE5DD] text-[#FF4500] ${
                isMobile ? "px-2 py-1.5 text-[10px]" : "px-3 py-2 text-[11px]"
              }`}
            >
              <span>距离约 {formatDistance(routeInfo.distance)}</span>
              <span>预计 {formatDuration(routeInfo.duration)}</span>
            </div>
          )}

          {/* 开始导航按钮（如果尚未激活导航） */}
          {!isNavigating && (
            <button
              onClick={startNavigation}
              disabled={!startPoint || !endPoint}
              className="mt-1 flex min-h-[40px] w-full items-center justify-center rounded-full bg-[#FF4500] px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:py-1.5 md:text-[12px]"
            >
              开始导航
            </button>
          )}

          {/* 路线详情折叠面板 - 移动端 max-h 限制，overflow-y-auto */}
          {routeInfo && routeSteps && routeSteps.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <button
                onClick={() => setShowSteps((prev) => !prev)}
                className="flex min-h-[40px] w-full items-center justify-between rounded-md bg-gray-50 px-2 py-2 text-[11px] text-gray-700 transition-colors hover:bg-gray-100"
              >
                <span>路线详情（{routeSteps.length} 步）</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${
                    showSteps ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showSteps && (
                <div
                  className={`mt-1 space-y-1 overflow-y-auto rounded-md bg-white px-2 py-1 text-[11px] text-gray-700 no-scrollbar ${
                    isMobile ? "max-h-[min(15dvh,120px)]" : "max-h-40"
                  }`}
                >
                  {routeSteps.map((step, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="mt-0.5 shrink-0 text-gray-400">{idx + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-800">{step.instruction}</div>
                        {step.distance > 0 && (
                          <div className="text-[10px] text-gray-500">
                            约 {formatDistance(step.distance)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 搜索 POI 弹层 - 仅桌面端（移动端使用内联搜索） */}
          {!isMobile && searchMode && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-white/98 p-3 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-[11px] text-gray-700">
            <span>
              选择
              {searchMode === "start" ? "起点" : "终点"}（
              {activeSchool ? activeSchool.name : "未选择学校"}）
            </span>
            <button
              onClick={() => {
                setSearchMode(null);
                setSearchQuery("");
              }}
              className="text-[11px] text-gray-400 hover:text-gray-600"
            >
              关闭
            </button>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索地点/设施..."
            className="mb-2 w-full rounded-md border border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1 text-[11px] focus:border-[#FF4500] focus:outline-none focus:ring-1 focus:ring-[#FF4500]/20"
          />
          <div className={`overflow-y-auto text-[11px] no-scrollbar ${isMobile ? "max-h-[min(20dvh,140px)]" : "max-h-40"}`}>
            {isLoadingPois ? (
              <div className="py-4 text-center text-gray-500">加载中...</div>
            ) : !allPois || allPois.length === 0 ? (
              <div className="py-4 text-center text-gray-400">
                暂无可用 POI 数据
              </div>
            ) : filteredPois.length === 0 ? (
              <div className="py-4 text-center text-gray-400">
                没有匹配的结果
              </div>
            ) : (
              filteredPois.map((poi) => {
                const q = debouncedSearchQuery.trim().toLowerCase();
                const aliasMatched = poi.alias && q && poi.alias.toLowerCase().includes(q);
                return (
                  <button
                    key={poi.id}
                    onClick={() => handleSelectPOI(poi)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left hover:bg-[#F6F7F8]"
                  >
                    <span className="font-medium text-gray-800">
                      {poi.name}
                      {aliasMatched && (
                        <span className="ml-1 font-normal text-gray-400">({poi.alias})</span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {poi.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>
            </div>
          )}
        </div>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


