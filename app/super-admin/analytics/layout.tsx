"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import {
  Users,
  Activity,
  ShoppingBag,
  MapPin,
  Bell,
  ChevronLeft,
} from "lucide-react";
import { ReportExportButton } from "@/components/admin/report-export-button";

const tabs = [
  { href: "/super-admin/analytics/users", label: "用户增长", icon: Users },
  { href: "/super-admin/analytics/retention", label: "用户留存", icon: Activity },
  { href: "/super-admin/analytics/bazaar", label: "生存集市", icon: ShoppingBag },
  { href: "/super-admin/analytics/content", label: "地图与内容", icon: MapPin },
  { href: "/super-admin/analytics/health", label: "消息与健康", icon: Bell },
];

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="box-border p-6 lg:p-8">
          <div className="mb-4 flex items-center gap-4">
            <Link
              href="/super-admin"
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-4 w-4" />
              返回看板
            </Link>
          </div>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">数据分析</h1>
              <p className="mt-1 text-sm text-gray-500">
                查看各维度趋势与分布，支持产品决策与迭代参考
              </p>
            </div>
            <ReportExportButton />
          </div>
          <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
          {children}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
