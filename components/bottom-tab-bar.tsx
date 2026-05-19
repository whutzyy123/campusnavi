"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LayoutDashboard, Map, User } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { getAdminHrefByRole, hasAdminAccess } from "@/lib/auth/role-access";

function isTabActive(pathname: string, tabKey: "map" | "admin" | "square" | "mine", role: string | null | undefined): boolean {
  if (tabKey === "map") return pathname === "/";
  if (tabKey === "admin") {
    if (role === "SUPER_ADMIN") return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }
  if (tabKey === "square") return pathname === "/square" || pathname.startsWith("/square/");
  return pathname === "/center" || pathname.startsWith("/center/") || pathname === "/profile" || pathname.startsWith("/profile/");
}

export function BottomTabBar() {
  const pathname = usePathname();
  const { currentUser, isAuthenticated } = useAuthStore();

  const role = currentUser?.role;
  const canAccessAdmin = hasAdminAccess(role);
  const adminHref = getAdminHrefByRole(role);
  const mineHref = isAuthenticated ? "/center" : "/login?redirect=%2Fcenter";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-tab-bar border-t border-gray-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="底部主导航"
    >
      {/* 移动端：紧凑布局，桌面端：居中放宽 */}
      <div className="mx-auto grid h-16 max-w-2xl grid-cols-4 px-1 md:h-14 md:max-w-3xl md:px-4 lg:max-w-5xl">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors md:flex-row md:gap-2 md:text-sm ${
            isTabActive(pathname, "map", role) ? "text-[#FF4500]" : "text-gray-500 hover:text-gray-700"
          }`}
          aria-current={isTabActive(pathname, "map", role) ? "page" : undefined}
        >
          <Map className="h-5 w-5 md:h-4 md:w-4" />
          <span>地图</span>
        </Link>

        {canAccessAdmin ? (
          <Link
            href={adminHref}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors md:flex-row md:gap-2 md:text-sm ${
              isTabActive(pathname, "admin", role) ? "text-[#FF4500]" : "text-gray-500 hover:text-gray-700"
            }`}
            aria-current={isTabActive(pathname, "admin", role) ? "page" : undefined}
          >
            <LayoutDashboard className="h-5 w-5 md:h-4 md:w-4" />
            <span>管理</span>
          </Link>
        ) : (
          <div className="pointer-events-none" aria-hidden="true" />
        )}

        <Link
          href="/square"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors md:flex-row md:gap-2 md:text-sm ${
            isTabActive(pathname, "square", role) ? "text-[#FF4500]" : "text-gray-500 hover:text-gray-700"
          }`}
          aria-current={isTabActive(pathname, "square", role) ? "page" : undefined}
        >
          <Compass className="h-5 w-5 md:h-4 md:w-4" />
          <span>广场</span>
        </Link>

        <Link
          href={mineHref}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors md:flex-row md:gap-2 md:text-sm ${
            isTabActive(pathname, "mine", role) ? "text-[#FF4500]" : "text-gray-500 hover:text-gray-700"
          }`}
          aria-current={isTabActive(pathname, "mine", role) ? "page" : undefined}
        >
          <User className="h-5 w-5 md:h-4 md:w-4" />
          <span>我的</span>
        </Link>
      </div>
    </nav>
  );
}
