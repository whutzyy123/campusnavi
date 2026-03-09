"use client";

import {
  Users,
  MapPin,
  AlertTriangle,
  CalendarDays,
  ShoppingBag,
  Users as UsersIcon,
  PlusCircle,
  Building2,
  FileSearch,
  MessageSquare,
  Tags,
} from "lucide-react";
import { StatCard } from "@/components/admin/stat-card";
import { CommandShortcuts } from "@/components/admin/command-shortcuts";
import { SetupGuide } from "@/components/admin/setup-guide";
import { LiveClock } from "@/components/admin/live-clock";
import type { SchoolAdminStats } from "@/lib/admin-actions";

interface AdminDashboardContentProps {
  stats: SchoolAdminStats | null;
  schoolName: string;
  userNickname: string;
  isStaff: boolean;
  isNewSchool: boolean;
}

/**
 * 管理员控制台内容区（Client Component）
 * 图标在此组件内导入，避免 Server → Client 传递函数
 */
export function AdminDashboardContent({
  stats,
  schoolName,
  userNickname,
  isStaff,
  isNewSchool,
}: AdminDashboardContentProps) {
  const quickLinksAdmin = [
    { label: "团队管理", href: "/admin/team", icon: UsersIcon },
    { label: "POI 管理", href: "/admin/school/pois", icon: PlusCircle },
    { label: "校区管理", href: "/admin/school/campuses", icon: Building2 },
  ];

  const quickLinksStaff = [
    { label: "举报审核", href: "/admin/audit", icon: FileSearch },
    { label: "留言审核", href: "/admin/audit/comments", icon: MessageSquare },
    { label: "分类管理", href: "/admin/school/categories", icon: Tags },
  ];

  return (
    <div className="box-border p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">
          您好，{schoolName} 管理员 {userNickname}。
        </h1>
        <LiveClock />
      </div>

      {stats &&
        (isNewSchool ? (
          <SetupGuide />
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
              isStaff ? "lg:grid-cols-3" : "lg:grid-cols-4"
            }`}
          >
            {!isStaff && (
              <StatCard
                icon={Users}
                value={stats.campusUsers}
                label="本校用户"
                variant="blue"
                href="/admin/school/users"
              />
            )}
            {!isStaff && (
              <StatCard
                icon={MapPin}
                value={`${stats.poiCount.official} / ${stats.poiCount.userContributed}`}
                label="POI（官方 / 众包）"
                variant="green"
                href="/admin/school/pois"
              />
            )}
            <StatCard
              icon={AlertTriangle}
              value={stats.pendingAudit}
              label="待审核举报"
              variant="amber"
              href="/admin/audit"
              urgent={stats.pendingAudit > 0}
            />
            <StatCard
              icon={CalendarDays}
              value={stats.activeEvents}
              label="进行中活动"
              variant="slate"
              href="/admin/school/activities"
            />
            <StatCard
              icon={ShoppingBag}
              value={stats.bazaarActivity}
              label="在架商品"
              variant="emerald"
              href="/admin/school/market"
            />
          </div>
        ))}

      <div className="mt-8">
        <CommandShortcuts
          title={isStaff ? "常用操作" : "快捷入口"}
          items={isStaff ? quickLinksStaff : quickLinksAdmin}
        />
      </div>
    </div>
  );
}
