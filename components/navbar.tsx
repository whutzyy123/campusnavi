/**
 * 全局导航栏组件
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { useNotificationStore } from "@/store/use-notification-store";
import { MapPin, ChevronDown, MessageSquare } from "lucide-react";
import { POISearchBar } from "@/components/poi-search-bar";
import { useMapSearchStore } from "@/store/use-map-search-store";
import { useFilterStore } from "@/store/use-filter-store";
import { getCampuses } from "@/lib/school-actions";
import { analytics } from "@/lib/analytics";

export function Navbar() {
  const pathname = usePathname();
  const { currentUser, isAuthenticated } = useAuthStore();
  const { activeSchool, setActiveSchool, schools, triggerFocusMap, triggerFocusToCampus } = useSchoolStore();
  const { unreadCount, messagesUnread, fetchUnreadCounts } = useNotificationStore();
  const { pois, onSelectPOI } = useMapSearchStore();
  const [showSchoolSelector, setShowSchoolSelector] = useState(false);
  const [showCampusSelector, setShowCampusSelector] = useState(false);
  const [campuses, setCampuses] = useState<Array<{ id: string; name: string; boundary: unknown; center: unknown }>>([]);
  const campusSelectorRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭校区选择器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (campusSelectorRef.current && !campusSelectorRef.current.contains(e.target as Node)) {
        setShowCampusSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 加载校区列表（仅当有学校且为首页/地图页时）
  useEffect(() => {
    if (!activeSchool?.id || !pathname || pathname !== "/") {
      setCampuses([]);
      return;
    }
    const fetchCampuses = async () => {
      try {
        const result = await getCampuses(activeSchool.id);
        if (result.success && Array.isArray(result.data)) {
          setCampuses(result.data);
        } else {
          setCampuses([]);
        }
      } catch {
        setCampuses([]);
      }
    };
    fetchCampuses();
  }, [activeSchool?.id, pathname]);

  // 加载当前用户信息（如果已登录）
  // 使用统一的初始化逻辑，避免重复请求
  const { initializeAuth, isInitialized } = useAuthStore();

  // 加载未读通知数量（已登录时，含分类：market / messages）
  useEffect(() => {
    if (currentUser?.id) {
      fetchUnreadCounts(currentUser.id);
    }
  }, [currentUser?.id, pathname, fetchUnreadCounts]);

  useEffect(() => {
    // 登录/注册页不请求 /api/auth/me，避免无意义的 401
    if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
      return;
    }

    // 如果还未初始化，调用统一的初始化函数
    if (!isInitialized) {
      initializeAuth();
    }
  }, [pathname, isInitialized, initializeAuth]);

  const hasBoundSchool = !!currentUser?.schoolId;

  const userInitial = currentUser?.nickname?.slice(0, 1)?.toUpperCase() || currentUser?.email?.slice(0, 1)?.toUpperCase() || "?";
  const userAvatar = (currentUser as { avatar?: string | null })?.avatar;

  /** 移动端显示短校区名（去掉「校区」后缀） */
  const shortCampusName = (name: string) => name.replace(/校区$/, "");

  return (
    <nav className="sticky top-0 z-navbar w-full border-b border-gray-200 bg-white/95 backdrop-blur-md shadow-sm pointer-events-auto">
      <div className="mx-auto flex h-14 md:h-16 max-w-7xl items-center gap-2 md:gap-4 px-2 md:px-4">
        {/* 左侧：品牌 Logo（shrink-0 防止被挤压，移动端优先显示） */}
        <Link href="/" className="flex shrink-0 items-center gap-2 pointer-events-auto group">
          <div className="relative flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-105">
            <Image
              src="/PIC.png"
              alt="校园生存指北"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </div>
          <span className="hidden md:block text-xl font-bold text-[#1A1A1B]">校园生存指北</span>
        </Link>

        {currentUser && (
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2 md:ml-2 min-w-0">
          {/* 有绑定学校的用户：学校 Pill + 校区选择（多校区时） */}
          {hasBoundSchool && activeSchool && (
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <button
                type="button"
                onClick={triggerFocusMap}
                className="flex items-center gap-1 md:gap-2 rounded-full bg-gray-100/80 px-2 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#FFE5DD]/80 cursor-pointer min-w-0"
              >
                <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-gray-600" />
                <span className="truncate max-w-[72px] md:max-w-none">{activeSchool.name}</span>
              </button>
              {campuses.length > 1 && pathname === "/" && (
                <div className="relative shrink-0" ref={campusSelectorRef}>
                  <button
                    type="button"
                    onClick={() => setShowCampusSelector(!showCampusSelector)}
                    className="flex items-center justify-center gap-1 rounded-full bg-gray-100/80 px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#FFE5DD]/80 cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  >
                    <span className="hidden sm:inline">校区选择</span>
                    <span className="sm:hidden">校区</span>
                    <ChevronDown className={`h-3.5 w-3.5 md:h-4 md:w-4 text-gray-500 transition-transform shrink-0 ${showCampusSelector ? "rotate-180" : ""}`} />
                  </button>
                  {showCampusSelector && (
                    <div className="absolute left-0 right-0 sm:right-auto sm:min-w-[140px] top-full z-navbar-dropdown mt-2 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                      {campuses.map((campus) => {
                        const rawCenter = campus.center;
                        const center: [number, number] = Array.isArray(rawCenter)
                          ? [Number(rawCenter[0]), Number(rawCenter[1])]
                          : [Number((rawCenter as { coordinates?: number[] })?.coordinates?.[0] ?? 0), Number((rawCenter as { coordinates?: number[] })?.coordinates?.[1] ?? 0)];
                        const rawBoundary = campus.boundary as { type?: string; coordinates?: number[][][] } | undefined;
                        const boundary = rawBoundary
                          ? { type: rawBoundary.type ?? "Polygon", coordinates: rawBoundary.coordinates }
                          : undefined;
                        return (
                          <button
                            key={campus.id}
                            type="button"
                            onClick={() => {
                              triggerFocusToCampus({ center, boundary });
                              setShowCampusSelector(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-[#1A1A1B] transition-colors hover:bg-[#FFE5DD]/60"
                          >
                            {shortCampusName(campus.name)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 无绑定学校的用户：可交互学校选择器 + 校区选择（多校区时） */}
          {!hasBoundSchool && schools.length > 0 && (
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              <div className="relative min-w-0">
                <button
                  onClick={() => {
                    if (activeSchool) triggerFocusMap();
                    setShowSchoolSelector(!showSchoolSelector);
                  }}
                  className="flex items-center gap-1 md:gap-2 rounded-full bg-gray-100/80 px-2 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#FFE5DD]/80 cursor-pointer min-w-0"
                >
                  <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-gray-600" />
                  <span className="truncate max-w-[72px] md:max-w-none">{activeSchool ? activeSchool.name : "选择学校"}</span>
                  <ChevronDown className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-gray-500" />
                </button>

                {showSchoolSelector && (
                <>
                  <div
                    className="fixed inset-0 z-0"
                    onClick={() => setShowSchoolSelector(false)}
                  />
                  <div className="absolute left-0 right-0 md:left-1/2 md:right-auto md:w-64 md:-translate-x-1/2 top-full z-navbar-dropdown mt-2 rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="max-h-64 overflow-y-auto p-2">
                      {schools.map((school) => (
                        <button
                          key={school.id}
                          onClick={() => {
                            analytics.map.schoolSelect({
                              school_id: school.id,
                              school_code: school.schoolCode,
                              from_detect: false,
                            });
                            setActiveSchool(school);
                            useFilterStore.getState().resetFilters();
                            setShowSchoolSelector(false);
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            activeSchool?.id === school.id
                              ? "bg-[#FFE5DD] text-[#FF4500]"
                              : "text-[#1A1A1B] hover:bg-gray-100"
                          }`}
                        >
                          <div className="font-medium">{school.name}</div>
                          <div className="text-xs text-gray-500">{school.schoolCode}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              </div>
              {campuses.length > 1 && activeSchool && pathname === "/" && (
                <div className="relative shrink-0" ref={campusSelectorRef}>
                  <button
                    type="button"
                    onClick={() => setShowCampusSelector(!showCampusSelector)}
                    className="flex items-center justify-center gap-1 rounded-full bg-gray-100/80 px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#FFE5DD]/80 cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  >
                    <span className="hidden sm:inline">校区选择</span>
                    <span className="sm:hidden">校区</span>
                    <ChevronDown className={`h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-gray-500 transition-transform ${showCampusSelector ? "rotate-180" : ""}`} />
                  </button>
                  {showCampusSelector && (
                    <div className="absolute left-0 right-0 sm:right-auto sm:min-w-[140px] top-full z-navbar-dropdown mt-2 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                      {campuses.map((campus) => {
                        const rawCenter = campus.center;
                        const center: [number, number] = Array.isArray(rawCenter)
                          ? [Number(rawCenter[0]), Number(rawCenter[1])]
                          : [Number((rawCenter as { coordinates?: number[] })?.coordinates?.[0] ?? 0), Number((rawCenter as { coordinates?: number[] })?.coordinates?.[1] ?? 0)];
                        const rawBoundary = campus.boundary as { type?: string; coordinates?: number[][][] } | undefined;
                        const boundary = rawBoundary
                          ? { type: rawBoundary.type ?? "Polygon", coordinates: rawBoundary.coordinates }
                          : undefined;
                        return (
                          <button
                            key={campus.id}
                            type="button"
                            onClick={() => {
                              triggerFocusToCampus({ center, boundary });
                              setShowCampusSelector(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-[#1A1A1B] transition-colors hover:bg-[#FFE5DD]/60"
                          >
                            {shortCampusName(campus.name)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* 中部：POI 搜索条（flex-1 占满剩余空间，移动端保持可点击） */}
        {/* 搜索条：flex-1 占满剩余空间，min-w-0 允许收缩，保证可点击 */}
        <div className="flex flex-1 justify-center min-w-0 mx-2 md:mx-4 basis-0">
          {currentUser && pois.length > 0 && onSelectPOI ? (
            <POISearchBar pois={pois} onSelectPOI={onSelectPOI} className="w-full min-w-[72px] max-w-xl" />
          ) : null}
        </div>

        {/* 右侧：未登录时显示学校入驻 + 登录；已登录时显示用户菜单 */}
        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          {!isAuthenticated && (
            <Link
              href="/school-onboarding"
              className={`rounded-full px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-all ${
                pathname === "/school-onboarding"
                  ? "bg-[#FF4500]/10 text-[#FF4500]"
                  : "text-slate-600 hover:text-[#FF4500] hover:bg-[#FF4500]/5"
              }`}
            >
              学校入驻
            </Link>
          )}
          {!isAuthenticated ? (
            <Link
              href="/login"
              className={`rounded-full px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium transition-all ${
                pathname === "/"
                  ? "border-2 border-[#FF4500] text-[#FF4500] hover:bg-[#FF4500]/5"
                  : "bg-[#FF4500] text-white hover:opacity-90"
              }`}
            >
              登录/注册
            </Link>
          ) : (
            <>
              <Link
                href="/center"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-300"
                title={currentUser?.nickname || "个人中心"}
              >
                {userAvatar ? (
                  <Image
                    src={userAvatar}
                    alt=""
                    width={36}
                    height={36}
                    className="h-full w-full object-cover"
                    unoptimized={userAvatar.startsWith("blob:")}
                  />
                ) : (
                  userInitial
                )}
                {/* 通知徽章（不含消息，消息单独显示） */}
                {unreadCount > messagesUnread && unreadCount > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 z-10 h-3 w-3 min-w-[12px] rounded-full border-2 border-white bg-[#FF4500]"
                    aria-label={`${unreadCount} 条未读通知`}
                  />
                )}
              </Link>
              <Link
                href="/messages"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-[#FF4500]"
                title="消息"
                aria-label="消息"
              >
                <MessageSquare className="h-5 w-5" />
                {messagesUnread > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 z-10 h-3 w-3 min-w-[12px] rounded-full border-2 border-white bg-[#FF4500]"
                    aria-label={`${messagesUnread} 条未读消息`}
                  />
                )}
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

