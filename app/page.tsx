"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useSchoolStore, type School } from "@/store/use-school-store";
import { useAuthStore } from "@/store/use-auth-store";
import { POIMap, type POIMapRef } from "@/components/poi-map";
import { POIDrawer } from "@/components/poi-drawer";
import { MapPin, Navigation, Eye, X } from "lucide-react";
import type { POIWithStatus } from "@/lib/poi-utils";
import { POISearchBar } from "@/components/poi-search-bar";
import { NavInfoCard } from "@/components/nav-info-card";
import { NavigationPanel } from "@/components/navigation-panel";

/**
 * 用户端首页
 * 功能：根据用户角色与学校绑定关系加载学校与地图，显示实时定位蓝点
 */
export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeSchool, inspectedSchool, setActiveSchool, setInspectedSchool, setSchools, schools } =
    useSchoolStore();
  const { isAuthenticated, currentUser } = useAuthStore();
  const hasBoundSchool = !!currentUser?.schoolId;
  const isAdminOrStaff = currentUser?.role === "ADMIN" || currentUser?.role === "STAFF";
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  
  // 地图定位引用
  const mapRef = useRef<POIMapRef>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSuccess, setLocationSuccess] = useState(false);
  const hasCheckedSchoolRef = useRef(false); // 防止学校检测重复执行
  
  const [pois, setPois] = useState<POIWithStatus[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<POIWithStatus | null>(null);
  const [showPOIDrawer, setShowPOIDrawer] = useState(false);
  const [showSchoolInspectModal, setShowSchoolInspectModal] = useState(false);

  // 确定当前使用的学校
  // 优先级：超级管理员视察 > 手动选择的 activeSchool
  const currentSchool = inspectedSchool || activeSchool;

  // 根据用户 schoolId 绑定强制加载学校（学生 / 管理员 / 工作人员）
  useEffect(() => {
    const loadLockedSchool = async () => {
      if (!currentUser?.schoolId) return;

      try {
        const response = await fetch(`/api/schools/${currentUser.schoolId}`);
        const data = await response.json();
        if (data.success && data.school) {
          setActiveSchool(data.school);
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
        const response = await fetch("/api/schools/list");
        const data = await response.json();
        if (data.success) {
          setSchools(data.schools);
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
        const response = await fetch(`/api/pois?schoolId=${currentSchool.id}`);
        const data = await response.json();
        if (data.success) {
          setPois(data.pois);
        }
      } catch (error) {
        console.error("获取 POI 列表失败:", error);
      }
    };

    fetchPOIs();
  }, [currentSchool]);


  // 重新定位
  const handleRelocate = () => {
    if (mapRef.current) {
      mapRef.current.locate();
    }
  };


  // 处理 POI 点击
  const handlePOIClick = (poi: POIWithStatus) => {
    setSelectedPOI(poi);
    setShowPOIDrawer(true);
  };

  // 刷新 POI 列表（状态更新后）
  const handlePOIStatusUpdate = async () => {
    if (!currentSchool) return;

    try {
      const response = await fetch(`/api/pois?schoolId=${currentSchool.id}`);
      const data = await response.json();
      if (data.success) {
        setPois(data.pois);
        // 更新选中的 POI
        if (selectedPOI) {
          const updatedPOI = data.pois.find((p: POIWithStatus) => p.id === selectedPOI.id);
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 地图容器 */}
      <POIMap
        ref={mapRef}
        school={currentSchool}
        pois={pois}
        userLocation={userLocation}
        onPOIClick={handlePOIClick}
        onLocationUpdate={async (location) => {
          setUserLocation(location);
          setLocationError(null);
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
              const response = await fetch(`/api/schools/detect?lat=${lat}&lng=${lng}`);
              const data = await response.json();

              if (!data.success || !data.school) {
                // 不在任何学校范围内，仅提示一次
                toast.error("您当前不在支持的校区内");
              }
              // 如果检测到学校，由 detectSchool 自动设置 activeSchool
            } catch (error) {
              console.error("检测学校失败:", error);
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

      {/* POI 详情抽屉 */}
      <POIDrawer
        poi={selectedPOI}
        schoolId={currentSchool?.id || ""}
        isOpen={showPOIDrawer}
        onClose={() => {
          setShowPOIDrawer(false);
          setSelectedPOI(null);
        }}
        onStatusUpdate={handlePOIStatusUpdate}
        userLocation={userLocation || undefined}
      />


      {/* 未登录提示条 */}
      {!isAuthenticated && (
        <div className="absolute left-0 right-0 top-20 z-20 mx-4 mt-2 rounded-lg bg-blue-50/95 backdrop-blur-sm border border-blue-200 px-4 py-2 text-sm text-blue-800 shadow-md">
          <div className="flex items-center justify-between">
            <span>登录后可解锁众包情报与路线规划功能</span>
            <button
              onClick={() => router.push("/login")}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              立即登录
            </button>
          </div>
        </div>
      )}

      {/* 常驻 POI 搜索条（顶部中央） */}
      <POISearchBar
        pois={pois}
        onSelectPOI={(poi) => {
          setSelectedPOI(poi);
          setShowPOIDrawer(true);
        }}
        isOpen={true}
        onClose={() => {}}
      />

      {/* 独立定位按钮（右下角） */}
      <button
        onClick={handleRelocate}
        disabled={isLocating}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        title="重新定位"
      >
        {isLocating ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent"></div>
        ) : (
          <Navigation className={`h-5 w-5 transition-colors ${locationSuccess ? "text-[#FF4500]" : "text-gray-700"}`} />
        )}
      </button>

      {/* 导航信息卡片 */}
      <NavInfoCard />

      {/* 无学校提示（仅对学生用户或游客显示，管理员/工作人员不应看到） */}
      {!currentSchool && !isLocating && !isAdminOrStaff && (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/95 px-6 py-4 shadow-lg">
          <div className="text-center">
            <p className="text-lg font-medium text-gray-800">未识别到学校</p>
            <p className="mt-2 text-sm text-gray-600">
              {locationError ||
                "您可能不在任何校区范围内，请通过顶部导航栏中的「选择学校」下拉框手动选择要查看的校区"}
            </p>
          </div>
        </div>
      )}

      {/* 超级管理员视察状态提示 */}
      {inspectedSchool && currentUser?.role === "SUPER_ADMIN" && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-lg bg-blue-50/95 backdrop-blur-sm border border-blue-200 px-4 py-2 text-sm text-blue-800 shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                正在视察：<span className="font-medium">{inspectedSchool.name}</span>
              </span>
            </div>
            <button
              onClick={handleClearInspection}
              className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
            >
              退出视察
            </button>
          </div>
        </div>
      )}

      {/* 校区选择模态框（超级管理员） */}
      {showSchoolInspectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
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

            <div className="max-h-96 overflow-y-auto p-4">
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
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
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
