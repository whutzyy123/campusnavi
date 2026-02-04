"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSchoolStore } from "@/store/use-school-store";
import { MapPin, Shuffle, X, Search, ChevronDown } from "lucide-react";

interface NavPOI {
  id: string;
  name: string;
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
    setSelectMode,
    swapPoints,
    clearNavigation,
    startNavigation,
  } = useNavigationStore();
  const { activeSchool } = useSchoolStore();

  const [allPois, setAllPois] = useState<NavPOI[] | null>(null);
  const [isLoadingPois, setIsLoadingPois] = useState(false);

  const [searchMode, setSearchMode] = useState<"start" | "end" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [showSteps, setShowSteps] = useState(false);

  // 懒加载当前学校的 POI 列表，用于搜索
  const ensurePoisLoaded = async () => {
    if (!activeSchool || allPois) return;
    setIsLoadingPois(true);
    try {
      const response = await fetch(`/api/pois?schoolId=${activeSchool.id}`);
      const data = await response.json();
      if (data.success) {
        const navPois: NavPOI[] = data.pois.map((p: any) => ({
          id: p.id,
          name: p.name,
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
    if (!allPois || !searchQuery.trim()) return allPois || [];
    const q = searchQuery.trim().toLowerCase();
    return allPois.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [allPois, searchQuery]);

  // 当学校变化时重置 POI 缓存
  useEffect(() => {
    setAllPois(null);
  }, [activeSchool?.id]);

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

  const handleSelectPOI = (poi: NavPOI) => {
    if (!searchMode) return;
    if (searchMode === "start") {
      useNavigationStore.getState().setStartPoint({
        lng: poi.lng,
        lat: poi.lat,
        name: poi.name,
      });
    } else {
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
    <div className="pointer-events-auto fixed left-4 top-24 z-50 w-80 max-w-full">
      <div className="rounded-xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <span className="text-sm font-semibold text-gray-800">校内步行导航</span>
          <button
            onClick={clearNavigation}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            title="退出导航"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3 text-xs text-gray-700">
          {/* 起点 */}
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-green-500" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium">起点</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectMode("start")}
                    className="text-[10px] text-[#0079D3] hover:underline"
                  >
                    地图选点
                  </button>
                  <button
                    onClick={async () => {
                      setSearchMode("start");
                      await ensurePoisLoaded();
                    }}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
                  >
                    <Search className="h-3 w-3" />
                    搜索
                  </button>
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-600">
                {startPoint
                  ? startPoint.name || "地图选点"
                  : "未设置起点（可使用当前位置或地图选点/搜索）"}
              </div>
            </div>
          </div>

          {/* 终点 */}
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-red-500" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium">终点</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectMode("end")}
                    className="text-[10px] text-[#0079D3] hover:underline"
                  >
                    地图选点
                  </button>
                  <button
                    onClick={async () => {
                      setSearchMode("end");
                      await ensurePoisLoaded();
                    }}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
                  >
                    <Search className="h-3 w-3" />
                    搜索
                  </button>
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-600">
                {endPoint
                  ? endPoint.name || "地图选点"
                  : "未设置终点（可在 POI 详情中点“到这去”或搜索）"}
              </div>
            </div>
          </div>

          {/* 交换与信息 */}
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
            <button
              onClick={swapPoints}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
            >
              <Shuffle className="h-3 w-3" />
              交换起终点
            </button>

            {routeInfo ? (
              <div className="flex flex-col items-end text-[11px] text-gray-600">
                <span>距离约 {formatDistance(routeInfo.distance)}</span>
                <span>预计 {formatDuration(routeInfo.duration)}</span>
              </div>
            ) : (
              <div className="text-[11px] text-gray-400">
                请设置起点和终点后，系统会自动规划路线
              </div>
            )}
          </div>

          {/* 开始导航按钮（如果尚未激活导航） */}
          {!isNavigating && (
            <button
              onClick={startNavigation}
              disabled={!startPoint || !endPoint}
              className="mt-1 flex w-full items-center justify-center rounded-full bg-[#FF4500] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              开始导航
            </button>
          )}

          {/* 路线详情折叠面板 */}
          {routeInfo && routeSteps && routeSteps.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <button
                onClick={() => setShowSteps((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                <span>路线详情（{routeSteps.length} 步）</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${
                    showSteps ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showSteps && (
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md bg-white px-2 py-1 text-[11px] text-gray-700">
                  {routeSteps.map((step, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="mt-0.5 text-gray-400">{idx + 1}.</span>
                      <div className="flex-1">
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
        </div>
      </div>

      {/* 搜索 POI 弹层 */}
      {searchMode && (
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
            placeholder="搜索 POI 名称或类别..."
            className="mb-2 w-full rounded-md border border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1 text-[11px] focus:border-[#0079D3] focus:outline-none focus:ring-1 focus:ring-[#0079D3]/20"
          />
          <div className="max-h-40 overflow-y-auto text-[11px]">
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
              filteredPois.map((poi) => (
                <button
                  key={poi.id}
                  onClick={() => handleSelectPOI(poi)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left hover:bg-[#F6F7F8]"
                >
                  <span className="font-medium text-gray-800">{poi.name}</span>
                  <span className="text-[10px] text-gray-500">
                    {poi.category}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


