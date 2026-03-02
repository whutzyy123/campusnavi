"use client";

import { createPortal } from "react-dom";
import { X, User, MessageSquare, ShoppingBag, KeyRound } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTimeDisplay } from "@/lib/utils";
import type { AdminUserDetail } from "@/lib/user-actions";
import { cn } from "@/lib/utils";

export interface AdminUserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  displayName?: string | null;
  profileDetail: AdminUserDetail | null;
  isLoading: boolean;
  /** 学校上下文中隐藏「所属学校」字段（如校级管理员查看本校用户时） */
  hideSchoolName?: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3",
        className
      )}
    >
      <Icon className="h-5 w-5 text-gray-500" />
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-4 animate-pulse rounded bg-gray-200", className)}
    />
  );
}

export function AdminUserDetailModal({
  isOpen,
  onClose,
  userId,
  displayName,
  profileDetail,
  isLoading,
  hideSchoolName = false,
}: AdminUserDetailModalProps) {
  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
      style={{ zIndex: 110 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-container flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Avatar + Nickname + User ID */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="h-14 w-14 animate-pulse rounded-full bg-gray-200" />
            ) : profileDetail?.basic.avatarUrl ? (
              <img
                src={profileDetail.basic.avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE5DD]">
                <User className="h-7 w-7 text-[#FF4500]" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {isLoading ? (
                  <SkeletonLine className="h-6 w-32" />
                ) : (
                  profileDetail?.basic.nickname || displayName || "—"
                )}
              </h3>
              <span className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                {userId}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <SkeletonLine className="h-4 w-20" />
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SkeletonLine key={i} className="h-5" />
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <SkeletonLine className="h-4 w-24" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse rounded-lg bg-gray-100"
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : profileDetail ? (
            <div className="space-y-6">
              {/* Info Grid */}
              <section>
                <h4 className="mb-3 text-sm font-medium text-gray-500">
                  基本信息
                </h4>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-500">邮箱</dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900">
                      {profileDetail.basic.email || "—"}
                    </dd>
                  </div>
                  {!hideSchoolName && (
                    <div>
                      <dt className="text-xs text-gray-500">所属学校</dt>
                      <dd className="mt-0.5 text-sm font-medium text-gray-900">
                        {profileDetail.basic.schoolName || "—"}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-gray-500">角色</dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900">
                      {profileDetail.basic.role}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">账户状态</dt>
                    <dd className="mt-0.5">
                      <StatusBadge
                        domain="user"
                        status={profileDetail.security.accountStatus}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">注册日期</dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900">
                      {formatDateTimeDisplay(profileDetail.meta.registrationDate)}
                    </dd>
                  </div>
                  {profileDetail.security.invitationCode && (
                    <div>
                      <dt className="text-xs text-gray-500">关联邀请码</dt>
                      <dd className="mt-0.5">
                        <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
                          {profileDetail.security.invitationCode}
                        </code>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Activity Stats */}
              <section>
                <h4 className="mb-3 text-sm font-medium text-gray-500">
                  活动统计
                </h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard
                    icon={MessageSquare}
                    label="留言总数"
                    value={profileDetail.stats.poiCommentCount}
                  />
                  <StatCard
                    icon={ShoppingBag}
                    label="集市发布"
                    value={profileDetail.stats.marketItemCount}
                  />
                  <StatCard
                    icon={KeyRound}
                    label="邀请码"
                    value={
                      profileDetail.security.invitationCode
                        ? "已使用"
                        : "未使用"
                    }
                    className="col-span-2 sm:col-span-1"
                  />
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
