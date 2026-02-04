"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, updateEmail, updatePassword } from "@/lib/profile-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import toast from "react-hot-toast";
import { User, Mail, Lock, Save, Loader2, Settings } from "lucide-react";

/**
 * 个人中心页面
 * 功能：修改昵称、个人简介、换绑邮箱、修改密码
 */
export default function ProfilePage() {
  const router = useRouter();
  const { currentUser, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"profile" | "account">("profile");

  // 个人资料表单状态
  const [profileForm, setProfileForm] = useState({
    nickname: "",
    bio: "",
  });
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

  // 加载用户信息
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setUser(data.user);
            setProfileForm({
              nickname: data.user.nickname || "",
              bio: data.user.bio || "",
            });
          }
        }
      } catch (error) {
        console.error("获取用户信息失败:", error);
      }
    };

    if (currentUser) {
      setProfileForm({
        nickname: currentUser.nickname || "",
        bio: (currentUser as any).bio || "",
      });
    } else {
      fetchUserInfo();
    }
  }, [currentUser, setUser]);

  // 更新个人资料
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const formData = new FormData();
      formData.append("nickname", profileForm.nickname);
      formData.append("bio", profileForm.bio);

      const result = await updateProfile(formData);

      if (result.success) {
        toast.success(result.message || "资料更新成功");
        // 更新本地用户信息
        if (result.user) {
          setUser({
            ...currentUser!,
            nickname: result.user.nickname,
          });
        }
        // 重新获取用户信息以同步最新数据
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setUser(data.user);
          }
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

  return (
    <AuthGuard>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1B]">个人中心</h1>
          <p className="mt-1 text-sm text-[#7C7C7C]">管理您的个人资料和账号设置</p>
        </div>

        {/* Tabs 导航 */}
        <div className="mb-6 border-b border-[#EDEFF1]">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === "profile"
                  ? "border-[#FF4500] text-[#FF4500]"
                  : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
              }`}
            >
              <User className="h-4 w-4" />
              个人资料
            </button>
            <button
              onClick={() => setActiveTab("account")}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === "account"
                  ? "border-[#FF4500] text-[#FF4500]"
                  : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
              }`}
            >
              <Settings className="h-4 w-4" />
              账号设置
            </button>
          </div>
        </div>

        {/* 个人资料 Tab */}
        {activeTab === "profile" && (
          <div className="rounded-lg border border-[#EDEFF1] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[#1A1A1B]">个人资料</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
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

              {/* 保存按钮 */}
              <div className="flex justify-end">
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
        )}

        {/* 账号设置 Tab */}
        {activeTab === "account" && (
          <div className="space-y-6">
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
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
