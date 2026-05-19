"use client";

import { AlertTriangle, LucideIcon, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface PageStateBaseProps {
  className?: string;
}

interface EmptyProps extends PageStateBaseProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ErrorProps extends PageStateBaseProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

interface PermissionProps extends PageStateBaseProps {
  title?: string;
  description?: string;
}

export function PageLoading({ className }: PageStateBaseProps) {
  return <LoadingSpinner className={className ?? "flex min-h-[40vh] items-center justify-center"} />;
}

/** 整页/区块加载用 PageLoading；内联占位块用 components/ui/skeleton.tsx 的 Skeleton */

export function PageEmpty({ icon, title, description, action, className }: EmptyProps) {
  return (
    <div className={className}>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}

export function PageError({
  title = "加载失败",
  description = "数据暂时不可用，请稍后重试。",
  onRetry,
  className,
}: ErrorProps) {
  return (
    <div className={className ?? "flex min-h-[30vh] items-center justify-center px-4"}>
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <h3 className="text-base font-semibold text-red-700">{title}</h3>
        <p className="mt-1 text-sm text-red-600">{description}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            重试
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PageNoPermission({
  title = "暂无权限",
  description = "你没有访问该页面的权限，请联系管理员。",
  className,
}: PermissionProps) {
  return (
    <div className={className ?? "flex min-h-[30vh] items-center justify-center px-4"}>
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
        </div>
        <h3 className="text-base font-semibold text-amber-700">{title}</h3>
        <p className="mt-1 text-sm text-amber-600">{description}</p>
      </div>
    </div>
  );
}

