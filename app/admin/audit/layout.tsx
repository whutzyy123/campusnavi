"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";

/**
 * 审核路由守卫：SuperAdmin 无权访问，重定向至超级管理员看板
 */
export default function AuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { currentUser, isInitialized, initializeAuth } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) initializeAuth();
  }, [isInitialized, initializeAuth]);

  useEffect(() => {
    if (!isInitialized || !currentUser) return;
    if (currentUser.role === "SUPER_ADMIN") {
      router.replace("/super-admin");
    }
  }, [isInitialized, currentUser, router]);

  if (!isInitialized || !currentUser) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent" />
      </div>
    );
  }

  if (currentUser.role === "SUPER_ADMIN") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">您无权访问此页面，正在跳转...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
