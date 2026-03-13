"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { StatCard } from "@/components/admin/stat-card";
import { CommandShortcuts } from "@/components/admin/command-shortcuts";
import { LiveClock } from "@/components/admin/live-clock";
import { DashboardSection } from "@/components/admin/dashboard-section";
import {
  Users,
  Building2,
  ShoppingBag,
  Plus,
  Tags,
  MessageSquare,
  MapPin,
  Package,
  Bell,
  AlertTriangle,
  BarChart3,
  Activity,
  TrendingUp,
} from "lucide-react";
import { ReportExportButton } from "@/components/admin/report-export-button";
import { getSuperAdminStats, type SuperAdminStats } from "@/lib/admin-actions";

/**
 * 超级管理员后台 - 系统看板
 * 聚焦：全局增长、功能使用、内容健康，支持产品决策与迭代方向参考
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
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-gray-900">
                欢迎回来，{currentUser?.nickname || "系统管理员"}。
              </h1>
              <LiveClock />
            </div>
            <ReportExportButton />
          </div>

          {/* 用户增长 */}
          <DashboardSection
            title="用户增长"
            description="注册用户与新增趋势，支持按学校查看"
            detailHref="/super-admin/analytics/users"
          >
            <StatCard
                  icon={Users}
                  value={stats?.totalUsers ?? 0}
                  label="注册用户"
                  variant="blue"
                  isLoading={isLoadingStats}
                  href="/super-admin/users"
                  subLabel={
                    stats && stats.newUsersToday > 0
                      ? `今日 +${stats.newUsersToday}`
                      : undefined
                  }
                />
                <StatCard
                  icon={Users}
                  value={stats?.newUsersThisWeek ?? 0}
                  label="本周新增"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={Users}
                  value={stats?.newUsersThisMonth ?? 0}
                  label="本月新增"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={Building2}
                  value={stats?.activeSchools ?? 0}
                  label="活跃学校"
                  variant="green"
                  isLoading={isLoadingStats}
                  href="/super-admin/schools"
                />
          </DashboardSection>

          <div className="mt-6" />

          {/* 用户留存 */}
          <DashboardSection
            title="用户留存"
            description="日活、周活、月活及留存率，基于留言、集市、失物招领等行为"
            detailHref="/super-admin/analytics/retention"
          >
            <StatCard
              icon={Activity}
              value={stats?.dauCount ?? 0}
              label="日活 (DAU)"
              variant="blue"
              isLoading={isLoadingStats}
            />
            <StatCard
              icon={Activity}
              value={stats?.wauCount ?? 0}
              label="周活 (WAU)"
              variant="slate"
              isLoading={isLoadingStats}
            />
            <StatCard
              icon={Activity}
              value={stats?.mauCount ?? 0}
              label="月活 (MAU)"
              variant="slate"
              isLoading={isLoadingStats}
            />
            <StatCard
              icon={TrendingUp}
              value={stats?.retention7d != null ? `${stats.retention7d}%` : "—"}
              label="7日留存率"
              variant="emerald"
              isLoading={isLoadingStats}
            />
            <StatCard
              icon={TrendingUp}
              value={stats?.retention30d != null ? `${stats.retention30d}%` : "—"}
              label="30日留存率"
              variant="emerald"
              isLoading={isLoadingStats}
            />
            <StatCard
              icon={Users}
              value={stats?.dormantUsers ?? 0}
              label="沉默用户"
              variant="amber"
              isLoading={isLoadingStats}
              subLabel="注册满30天且近30天无行为，可考虑召回"
            />
            <StatCard
              icon={TrendingUp}
              value={
                stats?.userActivationRate != null
                  ? `${stats.userActivationRate}%`
                  : "—"
              }
              label="用户活跃率"
              variant="emerald"
              isLoading={isLoadingStats}
              subLabel="MAU/总用户"
            />
          </DashboardSection>

          <div className="mt-6" />

          {/* 生存集市 */}
          <DashboardSection
            title="生存集市"
            description="商品发布、意向与交易完成情况，支持按类型与学校分布"
            detailHref="/super-admin/analytics/bazaar"
          >
            <StatCard
                  icon={ShoppingBag}
                  value={stats?.bazaarHealth ?? 0}
                  label="在架商品"
                  variant="emerald"
                  isLoading={isLoadingStats}
                  subLabel={
                    stats && stats.newListingsToday > 0
                      ? `今日 +${stats.newListingsToday}`
                      : undefined
                  }
                />
                <StatCard
                  icon={BarChart3}
                  value={stats?.intentionsCount ?? 0}
                  label="意向总数"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={Package}
                  value={stats?.completedTransactions ?? 0}
                  label="已完成交易"
                  variant="blue"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={ShoppingBag}
                  value={stats?.expiredItems ?? 0}
                  label="已过期商品"
                  variant="amber"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={BarChart3}
                  value={
                    stats?.marketCompletionRate != null
                      ? `${stats.marketCompletionRate}%`
                      : "—"
                  }
                  label="集市成交率"
                  variant="emerald"
                  isLoading={isLoadingStats}
                  subLabel="成交/(成交+过期)"
                />
                <StatCard
                  icon={BarChart3}
                  value={
                    stats?.marketExpiryRate != null
                      ? `${stats.marketExpiryRate}%`
                      : "—"
                  }
                  label="集市过期率"
                  variant="amber"
                  isLoading={isLoadingStats}
                  subLabel="过期/(成交+过期)"
                />
          </DashboardSection>

          <div className="mt-6" />

          {/* 集市类型分布（若有数据） */}
          {stats?.marketByType && stats.marketByType.length > 0 && (
            <DashboardSection
              title="在架商品类型分布"
              description="按交易类型统计"
            >
              {stats.marketByType.map((t) => (
                <StatCard
                  key={t.typeId}
                  icon={ShoppingBag}
                  value={t.count}
                  label={t.typeName}
                  variant="slate"
                  isLoading={isLoadingStats}
                />
              ))}
            </DashboardSection>
          )}

          <div className="mt-6" />

          {/* POI 与内容 */}
          <DashboardSection
            title="地图与内容"
            description="POI 新增、留言与失物招领，支持按学校分布"
            detailHref="/super-admin/analytics/content"
          >
            <StatCard
                  icon={MapPin}
                  value={stats?.totalPOIs ?? 0}
                  label="POI 总数"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={MessageSquare}
                  value={stats?.totalComments ?? 0}
                  label="留言总数"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={Package}
                  value={stats?.activeLostFound ?? 0}
                  label="进行中失物招领"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={MessageSquare}
                  value={
                    stats?.commentEngagementRate != null
                      ? `${stats.commentEngagementRate}%`
                      : "—"
                  }
                  label="留言互动率"
                  variant="emerald"
                  isLoading={isLoadingStats}
                  subLabel="有点赞留言/总留言"
                />
                <StatCard
                  icon={Package}
                  value={
                    stats?.lostFoundCompletionRate != null
                      ? `${stats.lostFoundCompletionRate}%`
                      : "—"
                  }
                  label="失物招领完成率"
                  variant="emerald"
                  isLoading={isLoadingStats}
                  subLabel="已找到/(已找到+已过期)"
                />
          </DashboardSection>

          <div className="mt-6" />

          {/* 消息 */}
          <DashboardSection
            title="消息"
            description="通知发送量与已读率趋势"
            detailHref="/super-admin/analytics/health"
          >
            <StatCard
                  icon={Bell}
                  value={stats?.totalNotifications ?? 0}
                  label="通知总数"
                  variant="slate"
                  isLoading={isLoadingStats}
                />
                <StatCard
                  icon={Bell}
                  value={`${stats?.notificationReadRate ?? 0}%`}
                  label="通知已读率"
                  variant="blue"
                  isLoading={isLoadingStats}
                />
          </DashboardSection>

          <div className="mt-6" />

          {/* 内容健康（待处理） */}
          <DashboardSection
            title="内容健康"
            description="待处理举报与反馈，需及时处理以保障内容质量"
          >
            <StatCard
                  icon={AlertTriangle}
                  value={stats?.pendingCommentReports ?? 0}
                  label="待审核留言举报"
                  variant={stats?.pendingCommentReports ? "orange" : "slate"}
                  isLoading={isLoadingStats}
                  subLabel="由校级管理员处理"
                  urgent={(stats?.pendingCommentReports ?? 0) > 0}
                />
                <StatCard
                  icon={AlertTriangle}
                  value={stats?.pendingMarketReports ?? 0}
                  label="待处理集市举报"
                  variant={stats?.pendingMarketReports ? "orange" : "slate"}
                  isLoading={isLoadingStats}
                  subLabel="由校级管理员处理"
                  urgent={(stats?.pendingMarketReports ?? 0) > 0}
                />
                <StatCard
                  icon={AlertTriangle}
                  value={stats?.pendingFeedback ?? 0}
                  label="待处理反馈"
                  variant={stats?.pendingFeedback ? "orange" : "slate"}
                  isLoading={isLoadingStats}
                  href="/super-admin/feedback"
                  urgent={(stats?.pendingFeedback ?? 0) > 0}
                />
                <StatCard
                  icon={AlertTriangle}
                  value={
                    stats?.feedbackResolutionRate != null
                      ? `${stats.feedbackResolutionRate}%`
                      : "—"
                  }
                  label="反馈处理率"
                  variant="slate"
                  isLoading={isLoadingStats}
                  subLabel="已处理/总反馈"
                />
                <StatCard
                  icon={AlertTriangle}
                  value={
                    stats?.commentReportResolutionRate != null
                      ? `${stats.commentReportResolutionRate}%`
                      : "—"
                  }
                  label="留言举报处理率"
                  variant="slate"
                  isLoading={isLoadingStats}
                  subLabel="已审核/有举报留言"
                />
          </DashboardSection>

          {/* 快捷入口 */}
          <div className="mt-8">
            <CommandShortcuts
              title="快捷入口"
              items={[
                { label: "添加学校", href: "/super-admin/schools", icon: Plus },
                {
                  label: "编辑全局分类",
                  href: "/super-admin/categories",
                  icon: Tags,
                },
                ...(stats?.pendingFeedback ? [{
                  label: `待处理反馈（${stats.pendingFeedback}）`,
                  href: "/super-admin/feedback",
                  icon: AlertTriangle,
                }] : []),
              ]}
            />
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
