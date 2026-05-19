"use client";

import { Suspense } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader, PageHeaderLayout } from "@/components/shared/page-header";
import { PageLoading } from "@/components/ui/page-state";
import { Settings } from "lucide-react";

function SettingsContent() {
  return (
    <PageHeaderLayout header={<PageHeader title="系统设置" backHref="/center" backLabel="返回个人中心" />}>
      <p className="mb-6 text-sm text-[#7C7C7C]">管理应用偏好与系统配置</p>

      <div className="space-y-1 overflow-hidden rounded-2xl border border-[#EDEFF1] bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE5DD]/60 text-[#FF4500]">
              <Settings className="h-5 w-5" />
            </div>
            <span className="font-medium text-[#1A1A1B]">通用设置</span>
          </div>
          <span className="text-sm text-[#7C7C7C]">建设中</span>
        </div>
      </div>
    </PageHeaderLayout>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense fallback={<PageLoading className="flex min-h-[50vh] items-center justify-center" />}>
        <SettingsContent />
      </Suspense>
    </AuthGuard>
  );
}
