"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { analytics } from "@/lib/analytics";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";

/** 页面标题映射（路径 -> 标题） */
const PAGE_TITLES: Record<string, string> = {
  "/": "首页",
  "/login": "登录",
  "/register": "注册",
  "/profile": "个人中心",
  "/admin": "管理后台",
  "/admin/school/pois": "POI 管理",
  "/admin/school/campuses": "校区管理",
  "/admin/audit": "审核管理",
  "/admin/audit/comments": "留言审核",
  "/admin/audit/market-items": "集市审核",
  "/admin/invitations": "邀请码管理",
  "/admin/market-config": "集市配置",
  "/super-admin": "超级管理",
  "/super-admin/schools": "学校管理",
  "/super-admin/users": "用户管理",
  "/super-admin/keywords": "敏感词管理",
  "/super-admin/categories": "分类管理",
  "/super-admin/market-config": "集市配置",
  "/activities": "校园活动",
  "/market": "生存集市",
};

function getPageTitle(pathname: string): string {
  return (PAGE_TITLES[pathname] ?? pathname.slice(1)) || "首页";
}

/**
 * 页面浏览埋点组件
 * 挂载到 layout，在路由变化时自动上报 page_view
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  const { currentUser } = useAuthStore();
  const { activeSchool, inspectedSchool } = useSchoolStore();
  const schoolId = (inspectedSchool ?? activeSchool)?.id ?? currentUser?.schoolId ?? null;

  useEffect(() => {
    if (!pathname) return;
    // 避免重复上报（如 StrictMode 双挂载）
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    const pageTitle = getPageTitle(pathname);
    const referrer = typeof document !== "undefined" ? document.referrer || undefined : undefined;

    analytics.pageView({
      page_path: pathname,
      page_title: pageTitle,
      school_id: schoolId,
      referrer: referrer || undefined,
      user_role: currentUser?.role ?? undefined,
    });
  }, [pathname, schoolId, currentUser?.role]);

  return null;
}
