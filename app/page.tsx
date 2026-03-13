"use client";

import { Suspense, useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSchoolStore, type School } from "@/store/use-school-store";
import { useAuthStore } from "@/store/use-auth-store";
import { POIMap, type POIMapRef } from "@/components/poi-map";
import { POIDrawer } from "@/components/poi-drawer";
import { LostFoundDetailModal, type LostFoundEventWithRelations } from "@/components/lost-found-detail-modal";
import { motion } from "framer-motion";
import { LocateFixed, Route, Eye, X } from "lucide-react";
import type { POIWithStatus } from "@/lib/poi-utils";
import { getPOIsBySchool } from "@/lib/poi-actions";
import { getSchoolById, getSchoolsList, detectSchoolByLocation } from "@/lib/school-actions";
import { analytics } from "@/lib/analytics";
import { useMapSearchStore } from "@/store/use-map-search-store";
import { NavInfoCard } from "@/components/nav-info-card";
import { NavigationPanel } from "@/components/navigation-panel";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { LandingPage } from "@/components/landing-page";
import { POIFilterPanel } from "@/components/poi-filter-panel";
import { useSyncMarketUrl } from "@/hooks/use-sync-market-url";
import { useMarketMapLinkage } from "@/hooks/use-market-map-linkage";
import { MarketOverlayDrawer } from "@/components/market/market-overlay-drawer";
import { MarketFocusBar } from "@/components/market/market-focus-bar";
import { MarketItemDetailModalController } from "@/components/market/market-item-detail-modal-controller";

/**
 * 用户端首页
 * - 未登录：展示营销落地页，不显示地图
 * - 已登录：展示地图应用（POI、导航、定位等）
 */
export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner className="flex h-screen items-center justify-center" />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  useSyncMarketUrl();
  const [pois, setPois] = useState<POIWithStatus[]>([]);
  useMarketMapLinkage(pois);
  const {
    activeSchool,
    inspectedSchool,
    setActiveSchool,
    setInspectedSchool,
    setSchools,
    schools,
    selectedSubPOI,
    clearSelection,
    selectParentPOI,
    focusCampusTrigger,
    setHighlightPoi,
  } = useSchoolStore();
  const { openNavigationPanel, routeInfo } = useNavigationStore();
  const { currentUser } = useAuthStore();
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const setMapSearch = useMapSearchStore((s) => s.setMapSearch);
  const setUserLocationStore = useMapSearchStore((s) => s.setUserLocation);
  const isAdminOrStaff = currentUser?.role === "ADMIN" || currentUser?.role === "STAFF";
  
  // 地图定位引用
  const mapRef = useRef<POIMapRef>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(false);
  const hasCheckedSchoolRef = useRef(false); // 防止学校检测重复执行

  const [selectedPOI, setSelectedPOI] = useState<POIWithStatus | null>(null);
  const [showPOIDrawer, setShowPOIDrawer] = useState(false);
  const [showSchoolInspectModal, setShowSchoolInspectModal] = useState(false);
  const [selectedLostFoundItem, setSelectedLostFoundItem] = useState<LostFoundEventWithRelations | null>(null);
  const [lostFoundListRefreshTrigger, setLostFoundListRefreshTrigger] = useState(0);

  // 确定当前使用的学校
  // 优先级：超级管理员视察 > 手动选择的 activeSchool
  const currentSchool = inspectedSchool || activeSchool;

  // 根据用户 schoolId 绑定强制加载学校（学生 / 管理员 / 工作人员）
  useEffect(() => {
    const loadLockedSchool = async () => {
      if (!currentUser?.schoolId) return;

      try {
        const result = await getSchoolById(currentUser.schoolId);
        if (result.success && result.data) {
          setActiveSchool(result.data);
        }
      } catch (error) {
        console.error("加载锁定学校失败:", error);
      }
    };

    loadLockedSchool();
  }, [isAdminOrStaff, currentUser?.schoolId, setActiveSchool]);

  // 加载学校列表（仅用于超级管理员视察功能）
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const result = await getSchoolsList();
        if (result.success && result.data) {
          setSchools(result.data);
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };

    fetchSchools();
  }, [setSchools]);

  // 加载 POI 列表
  useEffect(() => {
    const fetchPOIs = async () => {
      if (!currentSchool) {
        setPois([]);
        return;
      }

      try {
        const result = await getPOIsBySchool(currentSchool.id);
        if (result.success && result.data?.pois) {
          setPois(result.data.pois as POIWithStatus[]);
        }
      } catch (error) {
        console.error("获取 POI 列表失败:", error);
      }
    };

    fetchPOIs();
  }, [currentSchool]);

  // 地图点击子 POI 时打开抽屉
  useEffect(() => {
    if (selectedSubPOI) {
      setShowPOIDrawer(true);
    }
  }, [selectedSubPOI]);

  // 校区切换时关闭 POI 抽屉
  useEffect(() => {
    if (focusCampusTrigger > 0) {
      setShowPOIDrawer(false);
      setSelectedPOI(null);
    }
  }, [focusCampusTrigger]);

  // 从 URL 参数打开 POI 详情（如从中控台「查看回复」、失物招领、我的收藏跳转）
  const urlCommentId =
    searchParams.get("highlightCommentId") || searchParams.get("commentId");
  const urlLostFoundId = searchParams.get("lostFoundId");
  useEffect(() => {
    const poiId = searchParams.get("poiId");
    if (!poiId || pois.length === 0) return;

    const poi = pois.find((p) => p.id === poiId);
    if (poi) {
      setSelectedPOI(poi);
      setShowPOIDrawer(true);
      // 地图缩放至 POI 并高亮（复用 poi-map 的 highlightedPoiId 逻辑：panTo + setZoom + 脉动）
      setHighlightPoi(poiId);
    }
  }, [searchParams, pois, setHighlightPoi]);

  // 重新定位
  const handleRelocate = () => {
    if (mapRef.current) {
      mapRef.current.locate();
    }
  };


  // 处理 POI 点击（根 POI，view 为打开前的地图视图，用于关闭时恢复）
  const handlePOIClick = useCallback(
    (poi: POIWithStatus, view?: { center: [number, number]; zoom: number } | null) => {
      analytics.map.markerClick({ poi_id: poi.id, poi_name: poi.name, is_sub_poi: false });
      setSelectedPOI(poi);
      setShowPOIDrawer(true);
      if (!poi.parentId) {
        selectParentPOI(poi, view ?? null);
      }
    },
    [selectParentPOI]
  );

  // 向 Navbar 提供 POI 搜索数据（首页地图视图）
  useEffect(() => {
    if (currentUser && currentSchool) {
      setMapSearch(pois, handlePOIClick);
    } else {
      setMapSearch([], null);
      setUserLocationStore(null);
    }
    return () => {
      setMapSearch([], null);
      setUserLocationStore(null);
    };
  }, [currentUser, currentSchool, pois, handlePOIClick, setMapSearch, setUserLocationStore]);

  // 同步用户位置到搜索 store（用于搜索结果按距离排序）
  useEffect(() => {
    if (currentUser && currentSchool) {
      setUserLocationStore(userLocation ?? null);
    }
  }, [currentUser, currentSchool, userLocation, setUserLocationStore]);

  // 刷新 POI 列表（状态更新后）
  const handlePOIStatusUpdate = async () => {
    if (!currentSchool) return;

    try {
      const result = await getPOIsBySchool(currentSchool.id);
      if (result.success && result.data?.pois) {
        const poisList = result.data.pois as POIWithStatus[];
        setPois(poisList);
        // 更新选中的 POI
        if (selectedPOI) {
          const updatedPOI = poisList.find((p: POIWithStatus) => p.id === selectedPOI.id);
          if (updatedPOI) {
            setSelectedPOI(updatedPOI);
          }
        }
      }
    } catch (error) {
      console.error("刷新 POI 列表失败:", error);
    }
  };

  // 处理超级管理员选择视察学校
  const handleInspectSchool = (school: School) => {
    setInspectedSchool(school);
    setShowSchoolInspectModal(false);
  };

  // 清除视察状态
  const handleClearInspection = () => {
    setInspectedSchool(null);
  };

  // 未登录：仅展示营销落地页，不渲染地图
  if (!currentUser) {
    return <LandingPage />;
  }

  // 已登录：展示完整地图应用
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 地图容器 */}
      <POIMap
        ref={mapRef}
        school={currentSchool}
        pois={pois}
        userLocation={userLocation}
        onPOIClick={handlePOIClick}
        onMapBackgroundClick={() => {
          setShowPOIDrawer(false);
          setSelectedPOI(null);
          clearSelection();
        }}
        onLocationUpdate={async (location) => {
          setUserLocation(location);
          setUserLocationStore(location);
          // 定位成功后短暂显示橙色
          setLocationSuccess(true);
          setTimeout(() => {
            setLocationSuccess(false);
          }, 2000);

          // 检测学校（仅执行一次，避免循环）
          if (!hasCheckedSchoolRef.current && !currentUser?.schoolId && !currentSchool) {
            hasCheckedSchoolRef.current = true;
            try {
              const [lng, lat] = location;
              const result = await detectSchoolByLocation(lat, lng);

              if (result.success && result.data) {
                analytics.map.schoolDetectSuccess({ school_id: result.data.id });
                setActiveSchool(result.data);
              } else {
                analytics.map.schoolDetectFail();
                toast.error("您当前不在支持的校区内");
              }
            } catch (error) {
              console.error("检测学校失败:", error);
              analytics.map.schoolDetectFail();
              // 静默失败，不显示错误提示
            }
          }
        }}
        onLocatingChange={(locating) => {
          setIsLocating(locating);
        }}
      />

      {/* 导航控制面板 */}
      <NavigationPanel />

      {/* POI 分类筛选面板 */}
      <POIFilterPanel schoolId={currentSchool?.id ?? null} />

      {/* 生存集市 Overlay Drawer（Map-Centric） */}
      <MarketOverlayDrawer />

      {/* 集市商品详情 Modal（选中时展示，z-[210]，含「在地图中查看」→ Focus Mode） */}
      <MarketItemDetailModalController />

      {/* 集市 Focus Mode 浮动条（在地图中查看时显示） */}
      <MarketFocusBar />

      {/* POI 详情抽屉 */}
      <POIDrawer
        poi={selectedPOI}
        schoolId={currentSchool?.id || ""}
        isOpen={showPOIDrawer}
        onClose={() => {
          setShowPOIDrawer(false);
          setSelectedPOI(null);
          clearSelection();
        }}
        onStatusUpdate={handlePOIStatusUpdate}
        userLocation={userLocation || undefined}
        highlightCommentId={urlCommentId || undefined}
        highlightLostFoundId={urlLostFoundId || undefined}
        onSelectLostFoundItem={setSelectedLostFoundItem}
        lostFoundListRefreshTrigger={lostFoundListRefreshTrigger}
      />

      {/* 失物招领详情弹窗 - Portal 渲染，覆盖抽屉 */}
      {selectedLostFoundItem && (
        <LostFoundDetailModal
          item={selectedLostFoundItem}
          isOpen={!!selectedLostFoundItem}
          onClose={() => setSelectedLostFoundItem(null)}
          currentUser={currentUser}
          onMarkAsFoundSuccess={() => setLostFoundListRefreshTrigger((t) => t + 1)}
        />
      )}

      {/* 右下角地图操作按钮：routeInfo 存在时移动端上移避免与 NavInfoCard 重叠，含安全区 */}
      <motion.div
        className="fixed z-navbar-dropdown flex flex-col gap-3"
        style={{
          right: "calc(1rem + env(safe-area-inset-right, 0px))",
          bottom: isMobile ? "calc(1.5rem + env(safe-area-inset-bottom, 0px))" : "1.5rem",
        }}
        animate={{
          y: isMobile && routeInfo ? -100 : 0,
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
      >
        {/* 定位按钮 */}
        <button
          onClick={handleRelocate}
          disabled={isLocating}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          title="定位到我的位置"
          aria-label="定位到我的位置"
        >
          {isLocating ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
          ) : (
            <LocateFixed
              className={`h-5 w-5 transition-colors ${locationSuccess ? "text-[#FF4500]" : "text-gray-700"}`}
            />
          )}
        </button>
        {/* 导航按钮（主按钮，更突出） */}
        <button
          onClick={openNavigationPanel}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF4500] text-white shadow-lg transition-all hover:opacity-90 active:scale-95"
          title="路线规划"
          aria-label="路线规划"
        >
          <Route className="h-6 w-6" />
        </button>
      </motion.div>

      {/* 导航信息卡片 */}
      <NavInfoCard />

      {/* 超级管理员视察状态提示 */}
      {inspectedSchool && currentUser?.role === "SUPER_ADMIN" && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-lg bg-[#FFE5DD]/95 backdrop-blur-sm border border-[#FF4500]/30 px-4 py-2 text-sm text-[#FF4500] shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                正在视察：<span className="font-medium">{inspectedSchool.name}</span>
              </span>
            </div>
            <button
              onClick={handleClearInspection}
              className="rounded-lg px-2 py-1 text-xs font-medium text-[#FF4500] hover:bg-[#FFE5DD] transition-colors"
            >
              退出视察
            </button>
          </div>
        </div>
      )}

      {/* 校区选择模态框（超级管理员） */}
      {showSchoolInspectModal && (
        <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
          <div className="modal-container max-w-md">
            <div className="modal-header flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">选择视察校区</h3>
                <p className="text-sm text-gray-500">选择一个学校进行查看</p>
              </div>
              <button
                onClick={() => setShowSchoolInspectModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="modal-body p-4">
              {schools.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  暂无可用学校
                </div>
              ) : (
                <div className="space-y-2">
                  {schools.map((school) => (
                    <button
                      key={school.id}
                      onClick={() => handleInspectSchool(school)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-[#FF4500]/40 hover:bg-[#FFE5DD]"
                    >
                      <div className="font-medium text-gray-900">{school.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <code className="rounded bg-gray-100 px-2 py-0.5 font-mono">
                          {school.schoolCode}
                        </code>
                        <span>•</span>
                        <span>点击查看</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
