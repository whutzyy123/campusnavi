"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { StatCard } from "@/components/admin/stat-card";
import { CommandShortcuts } from "@/components/admin/command-shortcuts";
import { Users, Building2, ShoppingBag, Plus, Tags } from "lucide-react";
import { getSuperAdminStats, type SuperAdminStats } from "@/lib/admin-actions";

/**
 * 超级管理员后台 - 系统看板
 * 聚焦：全局增长 & 系统安全
 */
export default function SuperAdminPage() {
  const { currentUser } = useAuthStore();
  const [stats, setStats] = useState<SuperAdminStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  useEffect(() => {
    const load = async () => {
      setIsLoadingStats(true);
      try {
        const result = await getSuperAdminStats();
        if (result.success && result.data) {
          setStats(result.data);
        }
      } catch (err) {
        console.error("获取统计数据失败:", err);
      } finally {
        setIsLoadingStats(false);
      }
    };
    load();
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
        <div className="box-border p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              欢迎回来，系统管理员 {currentUser?.nickname || "管理员"}。
            </h1>
            <p className="mt-1 text-gray-600">当前全平台运行平稳。</p>
          </div>

          {/* 统计卡片：3 列 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={Users}
              value={stats?.totalUsers ?? 0}
              label="注册用户"
              variant="blue"
              isLoading={isLoadingStats}
              href="/super-admin/users"
            />
            <StatCard
              icon={Building2}
              value={stats?.activeSchools ?? 0}
              label="活跃学校"
              variant="green"
              isLoading={isLoadingStats}
              href="/super-admin/schools"
            />
            <StatCard
              icon={ShoppingBag}
              value={stats?.bazaarHealth ?? 0}
              label="在架商品"
              variant="emerald"
              isLoading={isLoadingStats}
              href="/super-admin/schools"
            />
          </div>

          {/* 快捷入口 */}
          <div className="mt-8">
            <CommandShortcuts
              title="快捷入口"
              items={[
                { label: "添加学校", href: "/super-admin/schools", icon: Plus },
                { label: "编辑全局分类", href: "/super-admin/categories", icon: Tags },
              ]}
            />
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
