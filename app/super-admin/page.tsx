"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { Users, Building2, TrendingUp, AlertTriangle } from "lucide-react";

interface SystemStats {
  totalUsers: number;
  totalSchools: number;
  todayPOIs: number;
  pendingReports: number;
}

/**
 * 超级管理员后台 - 系统看板
 * 功能：显示系统核心统计数据
 */
export default function SuperAdminPage() {
  const { currentUser } = useAuthStore();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // 检查是否为超级管理员
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // 加载系统统计数据
  useEffect(() => {
    const fetchStats = async () => {
      setIsLoadingStats(true);
      try {
        const response = await fetch("/api/admin/stats");
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error("获取统计数据失败:", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  if (!isSuperAdmin) {
    return (
      <AuthGuard requiredRole="SUPER_ADMIN">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-600">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-6">
          {/* 数据统计卡片 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card title="总注册用户数">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  {isLoadingStats ? (
                    <div className="h-8 w-16 animate-pulse rounded bg-gray-200"></div>
                  ) : (
                    <div className="text-2xl font-bold text-gray-900">{stats?.totalUsers || 0}</div>
                  )}
                  <div className="text-sm text-gray-500">注册用户</div>
                </div>
              </div>
            </Card>

            <Card title="已入驻学校总数">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <Building2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  {isLoadingStats ? (
                    <div className="h-8 w-16 animate-pulse rounded bg-gray-200"></div>
                  ) : (
                    <div className="text-2xl font-bold text-gray-900">{stats?.totalSchools || 0}</div>
                  )}
                  <div className="text-sm text-gray-500">入驻学校</div>
                </div>
              </div>
            </Card>

            <Card title="今日新增 POI">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100">
                  <TrendingUp className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  {isLoadingStats ? (
                    <div className="h-8 w-16 animate-pulse rounded bg-gray-200"></div>
                  ) : (
                    <div className="text-2xl font-bold text-gray-900">{stats?.todayPOIs || 0}</div>
                  )}
                  <div className="text-sm text-gray-500">今日新增</div>
                </div>
              </div>
            </Card>

            <Card title="待审核举报">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  {isLoadingStats ? (
                    <div className="h-8 w-16 animate-pulse rounded bg-gray-200"></div>
                  ) : (
                    <div className="text-2xl font-bold text-gray-900">{stats?.pendingReports || 0}</div>
                  )}
                  <div className="text-sm text-gray-500">待处理</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
