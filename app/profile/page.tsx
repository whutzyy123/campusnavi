"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import Link from "next/link";
import Image from "next/image";
import { updateProfile, updateEmail, updatePassword } from "@/lib/profile-actions";
import { deleteMyAccount } from "@/lib/user-actions";
import { getUserLostFoundEvents } from "@/lib/lost-found-actions";
import { getMe } from "@/lib/auth-server-actions";
import { getMarketThumbsUpRate } from "@/lib/market-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { useNotificationStore } from "@/store/use-notification-store";
import { AuthGuard } from "@/components/auth-guard";
import toast from "react-hot-toast";
import { User, Mail, Lock, Save, Loader2, AlertTriangle, Package, MapPin, ExternalLink, Clock, ShoppingBag, Info } from "lucide-react";
import { ImageUpload } from "@/components/shared/image-upload";
import { useMediaQuery } from "@/hooks/use-media-query";

/** 相对时间格式化，如 "2小时前" */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

/** 状态徽章文案 */
function getStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "进行中";
    case "FOUND":
      return "已找到";
    case "EXPIRED":
      return "已过期";
    case "HIDDEN":
      return "已隐藏";
    default:
      return status;
  }
}

/**
 * 中控台页面
 * 功能：修改昵称、个人简介、换绑邮箱、修改密码
 */
type ProfileTab = "profileInfo" | "lostFound";

export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingSpinner className="flex min-h-[50vh] items-center justify-center" />}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, setUser } = useAuthStore();
  const { unreadCount, fetchUnreadCounts } = useNotificationStore();
  const tabParam = searchParams.get("tab");
  const initialTab: ProfileTab =
    tabParam === "lostFound" ? "lostFound" : "profileInfo";
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

  // 同步 URL tab 参数到本地状态
  useEffect(() => {
    if (tabParam === "lostFound") setActiveTab("lostFound");
    else if (tabParam === "profileInfo" || !tabParam) setActiveTab("profileInfo");
  }, [tabParam]);
  const isMdAndUp = useMediaQuery("(min-width: 768px)");

  const handleTabChange = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
  }, []);

  const [marketThumbsUpRate, setMarketThumbsUpRate] = useState<number | null>(null);

  // 我的失物招领
  const [lostFoundEvents, setLostFoundEvents] = useState<
    Array<{
      id: string;
      poiId: string;
      description: string;
      images: string[];
      contactInfo: string | null;
      status: string;
      expiresAt: string;
      createdAt: string;
      poi: { id: string; name: string };
    }>
  >([]);
  const [lostFoundLoading, setLostFoundLoading] = useState(false);

  // 个人资料表单状态
  const [profileForm, setProfileForm] = useState({
    nickname: "",
    bio: "",
    avatar: "",
  });
  const [lastProfileUpdateAt, setLastProfileUpdateAt] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // 邮箱换绑表单状态
  const [emailForm, setEmailForm] = useState({
    newEmail: "",
    password: "",
  });
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // 密码修改表单状态
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 加载用户信息
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const result = await getMe();
        if (result.success && result.user) {
          setUser(result.user);
          setProfileForm({
            nickname: result.user.nickname || "",
            bio: result.user.bio || "",
            avatar: result.user.avatar || "",
          });
          setLastProfileUpdateAt(result.user.lastProfileUpdateAt || null);
        }
      } catch (error) {
        console.error("获取用户信息失败:", error);
      }
    };

    if (currentUser) {
      setProfileForm({
        nickname: currentUser.nickname || "",
        bio: (currentUser as any).bio || "",
        avatar: (currentUser as any).avatar || "",
      });
      setLastProfileUpdateAt((currentUser as any).lastProfileUpdateAt || null);
    } else {
      fetchUserInfo();
    }
  }, [currentUser, setUser]);

  // 个人信息 Tab：拉取好评率
  useEffect(() => {
    if (activeTab !== "profileInfo" || !currentUser?.id) return;
    getMarketThumbsUpRate(currentUser.id).then((r) => {
      if (r.success && r.data && r.data.total > 0) {
        setMarketThumbsUpRate(r.data.rate);
      } else {
        setMarketThumbsUpRate(null);
      }
    });
  }, [activeTab, currentUser?.id]);

  // 切换到「我的失物招领」时拉取数据
  useEffect(() => {
    if (activeTab !== "lostFound" || !currentUser?.id) return;

    const fetchLostFound = async () => {
      setLostFoundLoading(true);
      const result = await getUserLostFoundEvents(currentUser.id);
      setLostFoundLoading(false);
      if (result.success && result.data) {
        setLostFoundEvents(result.data);
      } else {
        toast.error(result.error || "获取失物招领列表失败");
      }
    };

    fetchLostFound();
  }, [activeTab, currentUser?.id]);

  // 进入中控台时刷新分类未读数（供 Tab 红点使用）
  useEffect(() => {
    if (currentUser?.id) {
      fetchUnreadCounts(currentUser.id);
    }
  }, [currentUser?.id, fetchUnreadCounts]);

  // 更新个人资料
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const formData = new FormData();
      formData.append("nickname", profileForm.nickname);
      formData.append("bio", profileForm.bio);
      const currentAvatar = (currentUser as any)?.avatar ?? "";
      if (profileForm.avatar !== currentAvatar) {
        formData.append("avatar", profileForm.avatar || "");
      }

      const result = await updateProfile(formData);

      if (result.success) {
        toast.success(result.message || "资料更新成功");
        if (result.user) {
          setUser({
            ...currentUser!,
            nickname: result.user.nickname ?? currentUser!.nickname,
            avatar: result.user.avatar ?? (currentUser as any)?.avatar,
            lastProfileUpdateAt: (result.user as any).lastProfileUpdateAt ?? null,
          });
          setLastProfileUpdateAt((result.user as any).lastProfileUpdateAt ?? null);
        }
        const meResult = await getMe();
        if (meResult.success && meResult.user) {
          setUser(meResult.user);
          setLastProfileUpdateAt(meResult.user.lastProfileUpdateAt || null);
        }
      } else {
        toast.error(result.message || "更新失败");
      }
    } catch (error) {
      console.error("更新资料失败:", error);
      toast.error("更新失败，请重试");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // 换绑邮箱
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEmail(true);

    try {
      const formData = new FormData();
      formData.append("newEmail", emailForm.newEmail);
      formData.append("password", emailForm.password);

      const result = await updateEmail(formData);

      if (result.success) {
        toast.success(result.message || "邮箱换绑成功");
        // 如果要求重新登录
        if (result.requiresReauth) {
          setTimeout(() => {
            router.push("/login");
          }, 1500);
        } else {
          // 清空表单
          setEmailForm({ newEmail: "", password: "" });
        }
      } else {
        toast.error(result.message || "换绑失败");
      }
    } catch (error) {
      console.error("换绑邮箱失败:", error);
      toast.error("换绑失败，请重试");
    } finally {
      setIsSavingEmail(false);
    }
  };

  // 修改密码
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPassword(true);

    try {
      const formData = new FormData();
      formData.append("oldPassword", passwordForm.oldPassword);
      formData.append("newPassword", passwordForm.newPassword);
      formData.append("confirmPassword", passwordForm.confirmPassword);

      const result = await updatePassword(formData);

      if (result.success) {
        toast.success(result.message || "密码修改成功");
        // 清空表单
        setPasswordForm({
          oldPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        toast.error(result.message || "修改失败");
      }
    } catch (error) {
      console.error("修改密码失败:", error);
      toast.error("修改失败，请重试");
    } finally {
      setIsSavingPassword(false);
    }
  };

  // 注销账号
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm("确定要注销账号吗？此操作不可恢复。");
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const result = await deleteMyAccount();
      if (result.success) {
        toast.success(result.message || "账号已注销");
        setUser(null);
        router.push("/");
      } else {
        toast.error(result.message || "注销失败");
      }
    } catch (error) {
      console.error("注销账号失败:", error);
      toast.error("注销失败，请重试");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AuthGuard requiredRole="STUDENT">
      <div
        className={`flex flex-col ${
          isMdAndUp
            ? "h-[calc(100vh-64px)] overflow-hidden"
            : "min-h-[calc(100vh-64px)] overflow-visible"
        }`}
      >
        <div className="mx-auto w-full max-w-4xl flex-shrink-0 px-4 pt-8 pb-4 md:max-w-6xl">
          <h1 className="text-2xl font-bold text-[#1A1A1B]">中控台</h1>
          <p className="mt-1 text-sm text-[#7C7C7C]">管理个人资料与失物招领</p>
        </div>

        {/* Tabs 导航 */}
        <div className="flex-shrink-0 border-b border-[#EDEFF1] bg-white/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl gap-6 px-4 md:max-w-6xl">
            <button
              onClick={() => handleTabChange("profileInfo")}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === "profileInfo"
                  ? "border-[#FF4500] text-[#FF4500]"
                  : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
              }`}
            >
              <User className="h-4 w-4" />
              个人信息
            </button>
            <button
              onClick={() => handleTabChange("lostFound")}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === "lostFound"
                  ? "border-[#FF4500] text-[#FF4500]"
                  : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
              }`}
            >
              <Package className="h-4 w-4" />
              我参与的失物找回记录
            </button>
          </div>
        </div>

        {/* Tab 内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable">
        {/* Profile Info Tab */}
        {activeTab === "profileInfo" && (
          <div className="mx-auto max-w-4xl flex flex-col gap-6 px-4 py-6 pb-24">
            {/* 个人资料：表单内容可滚动，保存按钮固定底部 */}
            <div className="flex max-h-[calc(100vh-280px)] flex-col overflow-hidden rounded-lg border border-[#EDEFF1] bg-white">
              <h2 className="flex-shrink-0 p-6 pb-0 text-lg font-semibold text-[#1A1A1B]">个人资料</h2>

              {/* 7 天冷却提示 / 上次修改 */}
              <div className="px-6 pt-4">
              {lastProfileUpdateAt && (() => {
                const last = new Date(lastProfileUpdateAt).getTime();
                const nextAllowed = last + 7 * 24 * 60 * 60 * 1000;
                const inCooldown = Date.now() < nextAllowed;
                return inCooldown ? (
                  <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      昵称和头像每 7 天仅限修改一次。下次可修改时间：{new Date(nextAllowed).toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ) : (
                  <p className="mb-4 text-xs text-[#7C7C7C]">
                    上次修改昵称/头像：{new Date(lastProfileUpdateAt).toLocaleString("zh-CN")}
                  </p>
                );
              })()}
              </div>

            <form id="profile-form" onSubmit={handleUpdateProfile} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-6 scrollbar-gutter-stable">
              {/* 头像 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">头像</label>
                <ImageUpload
                  value={profileForm.avatar}
                  onChange={(url) => setProfileForm((p) => ({ ...p, avatar: url }))}
                  onUploading={(loading) => {}}
                  className="max-w-[160px]"
                />
                <p className="mt-1 text-xs text-[#7C7C7C]">支持 JPG、PNG、WebP，头像与昵称共享 7 天修改限制</p>
              </div>

              {/* 昵称 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                  昵称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={profileForm.nickname}
                  onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })}
                  placeholder="请输入昵称（2-20个字符）"
                  minLength={2}
                  maxLength={20}
                  required
                  className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                />
                <p className="mt-1 text-xs text-[#7C7C7C]">昵称长度必须在 2-20 个字符之间</p>
              </div>

              {/* 集市好评率（有评价时显示） */}
              {marketThumbsUpRate != null && (
                <div className="rounded-lg border border-green-100 bg-green-50/50 px-4 py-2">
                  <span className="text-sm text-gray-600">集市好评率 </span>
                  <span className="font-medium text-green-600">{marketThumbsUpRate}%</span>
                </div>
              )}

              {/* 个人简介 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">个人简介</label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  placeholder="介绍一下自己吧（最多200字）"
                  maxLength={200}
                  rows={4}
                  className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                />
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-[#7C7C7C]">最多 200 个字符</p>
                  <span className="text-xs text-[#7C7C7C]">
                    {profileForm.bio.length}/200
                  </span>
                </div>
              </div>
              </div>

              {/* 保存按钮：固定底部，长表单时始终可见 */}
              <div className="flex flex-shrink-0 justify-end border-t border-[#EDEFF1] bg-white px-6 py-4">
                <button
                  type="submit"
                  disabled={isSavingProfile || !profileForm.nickname.trim()}
                  className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      保存
                    </>
                  )}
                </button>
              </div>
            </form>
            </div>

            {/* 账号设置 */}
            {/* 换绑邮箱 */}
            <div className="rounded-lg border border-[#EDEFF1] bg-white p-6">
              <div className="mb-4 flex items-center gap-2">
                <Mail className="h-5 w-5 text-[#7C7C7C]" />
                <h2 className="text-lg font-semibold text-[#1A1A1B]">换绑邮箱</h2>
              </div>
              <form onSubmit={handleUpdateEmail} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    当前邮箱
                  </label>
                  <input
                    type="email"
                    value={currentUser?.email || ""}
                    disabled
                    className="w-full rounded-lg border border-[#EDEFF1] bg-gray-50 px-4 py-2 text-sm text-[#7C7C7C]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    新邮箱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={emailForm.newEmail}
                    onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                    placeholder="请输入新邮箱地址"
                    required
                    className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    当前密码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={emailForm.password}
                    onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                    placeholder="请输入当前密码以验证身份"
                    required
                    className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                  />
                  <p className="mt-1 text-xs text-[#7C7C7C]">换绑邮箱后需要重新登录</p>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingEmail || !emailForm.newEmail || !emailForm.password}
                    className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingEmail ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        处理中...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        换绑邮箱
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* 修改密码 */}
            <div className="rounded-lg border border-[#EDEFF1] bg-white p-6">
              <div className="mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-[#7C7C7C]" />
                <h2 className="text-lg font-semibold text-[#1A1A1B]">修改密码</h2>
              </div>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    当前密码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                    placeholder="请输入当前密码"
                    required
                    className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    新密码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="请输入新密码（至少6位）"
                    minLength={6}
                    required
                    className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                  />
                  <p className="mt-1 text-xs text-[#7C7C7C]">密码长度至少为 6 位</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    确认新密码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="请再次输入新密码"
                    minLength={6}
                    required
                    className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FFE5DD]"
                  />
                  {passwordForm.newPassword &&
                    passwordForm.confirmPassword &&
                    passwordForm.newPassword !== passwordForm.confirmPassword && (
                      <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
                    )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      isSavingPassword ||
                      !passwordForm.oldPassword ||
                      !passwordForm.newPassword ||
                      !passwordForm.confirmPassword ||
                      passwordForm.newPassword !== passwordForm.confirmPassword
                    }
                    className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingPassword ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        处理中...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        修改密码
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* 危险区域：注销账号 */}
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h2 className="text-lg font-semibold text-red-800">注销账号</h2>
              </div>
              <p className="mb-4 text-sm text-red-700">
                一旦注销，您的所有数据（包括评论、收藏）将被永久删除，无法恢复。
              </p>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white transition-opacity hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  "确认注销"
                )}
              </button>
            </div>
          </div>
        )}

        {/* 失物招领 Tab */}
        {activeTab === "lostFound" && (
          <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
          <div className="rounded-lg border border-[#EDEFF1] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#1A1A1B]">失物招领</h2>

            {lostFoundLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#7C7C7C]" />
              </div>
            ) : lostFoundEvents.length === 0 ? (
              <p className="py-12 text-center text-sm text-[#7C7C7C]">
                You haven&apos;t posted any lost & found items yet.
              </p>
            ) : (
              <div className="space-y-4">
                {lostFoundEvents.map((event) => {
                  // PRD R16: 24h 后对他人不可见，expiresAt = createdAt + 24h
                  const isExpiredByTime = new Date() > new Date(event.expiresAt);
                  const displayStatus = isExpiredByTime ? "EXPIRED" : event.status;
                  const statusLabel = isExpiredByTime ? "已过期" : getStatusLabel(event.status);
                  return (
                    <div
                      key={event.id}
                      className={`rounded-lg border border-[#EDEFF1] p-4 transition-colors ${
                        isExpiredByTime ? "opacity-60 hover:border-[#EDEFF1]" : "hover:border-[#FFE5DD]"
                      }`}
                      title={isExpiredByTime ? "发布 24 小时后该信息已对他人不可见" : undefined}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="line-clamp-2 flex-1 text-sm font-medium text-[#1A1A1B]">
                          {event.description.length > 80
                            ? `${event.description.slice(0, 80)}...`
                            : event.description}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            displayStatus === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : displayStatus === "FOUND"
                                ? "bg-[#FFE5DD] text-[#FF4500]"
                                : displayStatus === "EXPIRED"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mb-3 flex items-center gap-1.5 text-xs text-[#7C7C7C]">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{event.poi.name}</span>
                      </div>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-xs text-[#7C7C7C]">
                          {formatRelativeTime(event.createdAt)}
                        </span>
                        {isExpiredByTime && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-slate-500"
                            title="发布 24 小时后该信息已对他人不可见"
                          >
                            <Info className="h-3.5 w-3.5" />
                            24 小时后已对他人不可见
                          </span>
                        )}
                      </div>
                      {isExpiredByTime ? (
                        <span
                          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-500"
                          aria-disabled="true"
                        >
                          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                          已过期
                        </span>
                      ) : (
                        <Link
                          href={`/?poiId=${event.poi.id}&lostFoundId=${event.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEFF1] px-3 py-1.5 text-sm font-medium text-[#1A1A1B] transition-colors hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          查看详情
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        )}
        </div>
      </div>
    </AuthGuard>
  );
}
