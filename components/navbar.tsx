/**
 * 全局导航栏组件
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { logoutUser } from "@/lib/auth-server-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { MapPin, LogOut, Settings, Map, ChevronDown, LayoutDashboard, User } from "lucide-react";
import toast from "react-hot-toast";

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, isAuthenticated } = useAuthStore();
  const { activeSchool, setActiveSchool, schools } = useSchoolStore();
  const [showSchoolSelector, setShowSchoolSelector] = useState(false);
  const hasFetchedMeRef = useRef(false);

  // 加载当前用户信息（如果已登录）
  // 使用统一的初始化逻辑，避免重复请求
  const { initializeAuth, isInitialized } = useAuthStore();
  
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

  const handleLogout = async () => {
    try {
      // 清除客户端状态
      useAuthStore.getState().clearUser();
      toast.success("已退出登录");
      // 调用 Server Action 清除 Cookie 并重定向
      await logoutUser();
    } catch (error) {
      // Server Action 重定向会抛出错误，这是正常的
      if (error instanceof Error && !error.message.includes("NEXT_REDIRECT")) {
        console.error("退出登录失败:", error);
        toast.error("退出登录失败，请重试");
      }
    }
  };

  // 判断用户是否有管理权限：校级管理员(ADMIN)、校内工作人员(STAFF)、超级管理员(SUPER_ADMIN)
  const hasAdminAccess = 
    currentUser?.role === "ADMIN" || 
    currentUser?.role === "STAFF" || 
    currentUser?.role === "SUPER_ADMIN";
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const hasBoundSchool = !!currentUser?.schoolId;

  return (
    <nav className="sticky top-0 z-[100] w-full border-b border-[#EDEFF1] bg-white pointer-events-auto">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* 左侧：Logo */}
        <Link href="/" className="flex items-center gap-2 pointer-events-auto">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF4500]">
            <Map className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold text-[#1A1A1B]">校园生存指北</span>
        </Link>

        {/* 中部：学校选择 / 显示 */}
        <div className="hidden md:block">
          {/* 超级管理员：系统看板 + 学校选择器 */}
          {isSuperAdmin && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#0079D3]">
            <Settings className="h-4 w-4" />
            <span>系统看板</span>
          </div>
            </div>
          )}

          {/* 有绑定学校的用户（学生 / 管理员 / 工作人员）：只读显示当前学校 */}
          {hasBoundSchool && activeSchool && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#1A1A1B]">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">{activeSchool.name}</span>
                </div>
          )}

          {/* 无绑定学校的用户（游客 / 超级管理员等）：允许手动选择学校 */}
          {!hasBoundSchool && schools.length > 0 && (
            <div className="relative">
                  <button
                    onClick={() => setShowSchoolSelector(!showSchoolSelector)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
                  >
                    <MapPin className="h-4 w-4" />
                <span>{activeSchool ? activeSchool.name : "选择学校"}</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>

              {showSchoolSelector && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowSchoolSelector(false)}
                      />
                      <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-[#EDEFF1] bg-white shadow-lg">
                        <div className="max-h-64 overflow-y-auto p-2">
                          {schools.map((school) => (
                            <button
                              key={school.id}
                              onClick={() => {
                                setActiveSchool(school);
                                setShowSchoolSelector(false);
                              }}
                              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                activeSchool?.id === school.id
                                  ? "bg-[#FFE5DD] text-[#FF4500]"
                                  : "text-[#1A1A1B] hover:bg-[#F6F7F8]"
                              }`}
                            >
                              <div className="font-medium">{school.name}</div>
                              <div className="text-xs text-[#7C7C7C]">{school.schoolCode}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                </>
              )}
            </div>
        )}
        </div>

        {/* 右侧：用户操作 */}
        <div className="flex items-center gap-4">
          {!isAuthenticated ? (
            // 未登录：显示登录按钮
            <Link
              href="/login"
              className="rounded-full bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              登录/注册
            </Link>
          ) : (
            // 已登录
            <>
              {/* 欢迎信息 */}
              <div className="hidden items-center gap-2 text-sm text-[#1A1A1B] md:flex">
                <span>欢迎,</span>
                <span className="font-medium">{currentUser?.nickname}</span>
              </div>

              {/* 个人中心入口 */}
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
              >
                <User className="h-4 w-4" />
                <span className="hidden md:inline">个人中心</span>
              </Link>

              {/* 管理后台入口 - 显示给有管理权限的用户（ADMIN、STAFF、SUPER_ADMIN） */}
              {hasAdminAccess && (
                <Link
                  href={isSuperAdmin ? "/super-admin" : "/admin"}
                  className="relative z-[110] flex items-center gap-2 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8] pointer-events-auto"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden md:inline">管理后台</span>
                </Link>
              )}

              {/* 退出按钮 */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline">退出</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

