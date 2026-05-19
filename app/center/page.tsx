"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { useAuthStore } from "@/store/use-auth-store";
import { useNotificationStore } from "@/store/use-notification-store";
import {
  ShoppingBag,
  Heart,
  Calendar,
  Package,
  MessageSquare,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/ui/notify";
import { analytics } from "@/lib/analytics";

interface CenterEntry {
  id: string;
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  badge?: number;
}

function CenterContent() {
  const router = useRouter();
  const { currentUser, isLoggingOut } = useAuthStore();
  const { unreadCount, marketUnread, messagesUnread, fetchUnreadCounts } = useNotificationStore();

  useEffect(() => {
    if (currentUser?.id) {
      fetchUnreadCounts(currentUser.id);
    }
  }, [currentUser?.id, fetchUnreadCounts]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    analytics.auth.logoutClick();
    notify.loading("正在退出...", { id: "logout" });
    try {
      await useAuthStore.getState().logout();
    } catch (error) {
      if (error instanceof Error && !error.message.includes("NEXT_REDIRECT")) {
        notify.error("退出登录失败，请重试", { id: "logout" });
        console.error("退出登录失败:", error);
      }
    }
  };

  const profileHref =
    marketUnread > 0
      ? "/center/market"
      : messagesUnread > 0
        ? "/messages"
        : "/profile";

  const entries: CenterEntry[] = [
    {
      id: "market",
      label: "生存集市",
      href: "/center/market",
      icon: ShoppingBag,
      badge: marketUnread > 0 ? marketUnread : undefined,
    },
    {
      id: "favorites",
      label: "我的收藏",
      href: "/favorites",
      icon: Heart,
    },
    {
      id: "activities",
      label: "校园活动",
      href: "/activities",
      icon: Calendar,
    },
    {
      id: "lost-found",
      label: "失物招领",
      href: "/lost-found",
      icon: Package,
    },
    {
      id: "feedback",
      label: "帮助与反馈",
      href: "/feedback",
      icon: MessageSquare,
    },
    {
      id: "settings",
      label: "系统设置",
      href: "/settings",
      icon: Settings,
    },
  ];

  const userInitial =
    currentUser?.nickname?.slice(0, 1)?.toUpperCase() ||
    currentUser?.email?.slice(0, 1)?.toUpperCase() ||
    "?";
  const userAvatar = (currentUser as { avatar?: string | null })?.avatar;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
      {/* 用户信息卡片 — 点击跳转"我的账号" */}
      <Link
        href="/profile"
        className="mb-8 flex items-center gap-4 rounded-2xl border border-[#EDEFF1] bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-[#FF4500]/30 active:scale-[0.99]"
      >
        <div className="relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100">
          {userAvatar ? (
            <Image
              src={userAvatar}
              alt=""
              fill
              className="object-cover"
              unoptimized={userAvatar.startsWith("blob:")}
              sizes="64px"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-500">
              {userInitial}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-[#1A1A1B]">
            {currentUser?.nickname || "用户"}
          </h1>
          <p className="truncate text-sm text-[#7C7C7C]">{currentUser?.email}</p>
        </div>
        {/* 积分显示在右侧，使用主题色 */}
        <Link href="/center/points" className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#FFE5DD] px-3 py-1.5 transition-all hover:bg-[#FF4500]/20 hover:shadow-sm active:scale-[0.97]">
          <span className="text-sm font-semibold text-[#FF4500]">{currentUser?.points ?? 0}</span>
          <span className="text-xs text-[#FF4500]/80">积分</span>
        </Link>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#7C7C7C] ml-2" />
      </Link>

      {/* 功能入口列表 */}
      <div className="space-y-1 rounded-2xl border border-[#EDEFF1] bg-white shadow-sm overflow-hidden">
        {entries.map((entry) => {
          const Icon = entry.icon;
          const content = (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE5DD]/60 text-[#FF4500]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-medium text-[#1A1A1B]">{entry.label}</span>
                {entry.badge != null && entry.badge > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF4500] px-2 text-xs font-medium text-white">
                    {entry.badge > 99 ? "99+" : entry.badge}
                  </span>
                )}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#7C7C7C]" />
            </>
          );

          if (entry.href) {
            return (
              <Link
                key={entry.id}
                href={entry.href}
                className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-[#F6F7F8] active:bg-[#EDEFF1]"
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={entry.id}
              type="button"
              onClick={entry.onClick}
              className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-[#F6F7F8] active:bg-[#EDEFF1]"
            >
              {content}
            </button>
          );
        })}
      </div>

      {/* 退出登录 */}
      <div className="mt-8">
        <Button
          type="button"
          variant="ghost"
          loading={isLoggingOut}
          onClick={handleLogout}
          className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-red-600 hover:bg-red-100 hover:text-red-600"
        >
          {!isLoggingOut ? <LogOut className="h-5 w-5" /> : null}
          退出登录
        </Button>
      </div>
    </div>
  );
}

export default function CenterPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <div className="min-h-[calc(100vh-64px)] bg-[#F6F7F8]">
        <div className="mx-auto max-w-2xl px-4 pt-8 pb-4">
          <h1 className="text-2xl font-bold text-[#1A1A1B]">个人中心</h1>
          <p className="mt-1 text-sm text-[#7C7C7C]">管理您的账号与常用功能</p>
        </div>
        <CenterContent />
      </div>
    </AuthGuard>
  );
}
