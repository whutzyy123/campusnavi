/**
 * 客户端权限守卫组件
 * 用于保护需要管理员权限的页面
 */

"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: "ADMIN" | "STUDENT" | "SUPER_ADMIN";
  requireSchoolId?: boolean; // 是否需要 schoolId（用于 POI 管理等需要学校上下文的功能）
}

export function AuthGuard({ children, requiredRole = "ADMIN", requireSchoolId = false }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, isAuthenticated, isInitialized, initializeAuth } = useAuthStore();

  // 组件挂载时立即触发一次用户信息获取
  useEffect(() => {
    if (!isInitialized) {
      initializeAuth();
    }
  }, [isInitialized, initializeAuth]);

  // 权限检查和重定向逻辑（仅在初始化完成后执行）
  useEffect(() => {
    // 如果还未初始化，不执行任何重定向
    if (!isInitialized) {
      return;
    }

    // 初始化完成后，检查是否已登录
    if (!isAuthenticated || !currentUser) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // 检查角色权限
    if (requiredRole === "ADMIN" && currentUser.role !== "ADMIN" && currentUser.role !== "STAFF" && currentUser.role !== "SUPER_ADMIN") {
      router.push("/?error=unauthorized");
      return;
    }
    if (requiredRole === "SUPER_ADMIN" && currentUser.role !== "SUPER_ADMIN") {
      router.push("/?error=unauthorized");
      return;
    }

    // 如果要求必须有 schoolId（如 POI 管理），则超级管理员（schoolId 为 null）无法访问
    if (requireSchoolId && !currentUser.schoolId) {
      router.push("/?error=unauthorized");
      return;
    }
  }, [isInitialized, isAuthenticated, currentUser, requiredRole, requireSchoolId, router, pathname]);

  // 如果还未初始化，显示加载界面（严禁执行重定向）
  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent mx-auto"></div>
          <p className="text-sm text-gray-600">正在验证身份...</p>
        </div>
      </div>
    );
  }

  // 初始化完成后，如果未登录，显示加载界面（重定向已在 useEffect 中处理）
  if (!isAuthenticated || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent mx-auto"></div>
          <p className="text-sm text-gray-600">正在跳转...</p>
        </div>
      </div>
    );
  }

  // 权限检查
  if (requiredRole === "ADMIN" && currentUser.role !== "ADMIN" && currentUser.role !== "STAFF" && currentUser.role !== "SUPER_ADMIN") {
    return null;
  }
  if (requiredRole === "SUPER_ADMIN" && currentUser.role !== "SUPER_ADMIN") {
    return null;
  }

  // 如果要求必须有 schoolId，但用户没有 schoolId，则不渲染
  if (requireSchoolId && !currentUser.schoolId) {
    return null;
  }

  return <>{children}</>;
}

