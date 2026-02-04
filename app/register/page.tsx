"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/auth-server-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { UserPlus, CheckCircle, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

/**
 * 注册页面
 * 功能：邮箱、密码、邀请码注册
 */
export default function RegisterPage() {
  const router = useRouter();
  const { setUser, isAuthenticated } = useAuthStore();
  const { schools, setActiveSchool, setSchools } = useSchoolStore();

  const [formData, setFormData] = useState({
    email: "",
    nickname: "",
    password: "",
    confirmPassword: "",
    schoolId: "",
    role: "STUDENT" as "STUDENT" | "ADMIN" | "STAFF",
    invitationCode: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invitationCodeStatus, setInvitationCodeStatus] = useState<{
    valid: boolean;
    schoolName?: string;
    message?: string;
  } | null>(null);
  const [isCheckingInvitationCode, setIsCheckingInvitationCode] = useState(false);

  // 计算是否显示邀请码输入框
  const showInvitationCode = formData.role === "ADMIN" || formData.role === "STAFF";

  // 如果已登录，重定向到首页
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  // 加载学校列表
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const response = await fetch("/api/schools/list");
        const data = await response.json();
        if (data.success) {
          setSchools(data.schools);
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };

    fetchSchools();
  }, [setSchools]);

  // 当角色改变时，清空邀请码和学校ID
  useEffect(() => {
    if (formData.role === "STUDENT") {
      setFormData((prev) => ({ ...prev, invitationCode: "" }));
      setInvitationCodeStatus(null);
    } else {
      // 切换到管理员/工作人员时，清空学校ID（由邀请码自动锁定）
      setFormData((prev) => ({ ...prev, schoolId: "" }));
      setInvitationCodeStatus(null);
    }
  }, [formData.role]);

  // 检查邀请码（当用户输入邀请码时）
  useEffect(() => {
    if (!showInvitationCode || !formData.invitationCode || formData.invitationCode.length < 4) {
      setInvitationCodeStatus(null);
      return;
    }

    // 防抖：延迟 500ms 后检查
    const timer = setTimeout(async () => {
      setIsCheckingInvitationCode(true);
      try {
        const response = await fetch("/api/invitation-codes/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: formData.invitationCode.trim().toUpperCase(),
            role: formData.role,
          }),
        });

        const data = await response.json();

        if (data.success && data.valid) {
          setInvitationCodeStatus({
            valid: true,
            schoolName: data.data.schoolName,
            message: `已匹配：${data.data.schoolName}`,
          });
        } else {
          setInvitationCodeStatus({
            valid: false,
            message: data.message || "邀请码无效",
          });
        }
      } catch (error) {
        console.error("检查邀请码失败:", error);
        setInvitationCodeStatus({
          valid: false,
          message: "检查邀请码失败，请稍后重试",
        });
      } finally {
        setIsCheckingInvitationCode(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.invitationCode, formData.role, showInvitationCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 前端验证 - 根据角色判断必填项
    const basicInfoValid = formData.email && formData.nickname && formData.password && formData.confirmPassword;
    
    if (!basicInfoValid) {
      setError("请填写所有必填项");
      return;
    }

    // 学生角色必须选择学校
    if (formData.role === "STUDENT" && !formData.schoolId) {
      setError("请选择学校");
      return;
    }

    if (formData.password.length < 6) {
      setError("密码长度至少为 6 位");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if ((formData.role === "ADMIN" || formData.role === "STAFF") && !formData.invitationCode) {
      setError("管理员或工作人员角色必须提供邀请码");
      return;
    }

    setIsSubmitting(true);

    try {
      // 创建 FormData
      const formDataObj = new FormData();
      formDataObj.append("email", formData.email.trim());
      formDataObj.append("nickname", formData.nickname.trim());
      formDataObj.append("password", formData.password);
      formDataObj.append("role", formData.role);
      // 学生角色需要传递 schoolId，管理员/工作人员由邀请码自动获取
      if (formData.role === "STUDENT" && formData.schoolId) {
        formDataObj.append("schoolId", formData.schoolId);
      }
      if (formData.invitationCode) {
        formDataObj.append("invitationCode", formData.invitationCode);
      }

      // 调用 Server Action
      const result = await registerUser(formDataObj);

      // 如果返回错误（业务错误，非重定向）
      if (result && !result.success) {
        setError(result.message || "注册失败");
        setIsSubmitting(false);
        return;
      }

      // 如果返回成功但没有重定向（理论上不应该发生）
      if (result && result.success) {
        toast.success("注册成功，正在跳转...");
        setSuccess(true);
        
        // 获取用户信息
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          if (data.user.schoolId) {
            const selectedSchool = schools.find((s) => s.id === data.user.schoolId);
            if (selectedSchool) {
              setActiveSchool(selectedSchool);
            }
          }
        }
      }
    } catch (err) {
      // Server Action 重定向会抛出包含 "NEXT_REDIRECT" 的错误，这是正常的
      // 不要拦截这个错误，让 Next.js 正常处理跳转
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
        // 显示成功提示，然后让 Next.js 处理跳转
        toast.success("注册成功，正在跳转...");
        // 不设置 setIsSubmitting(false)，让按钮保持加载状态直到跳转完成
        return;
      }
      
      // 只展示真正的业务错误信息
      if (err instanceof Error) {
        setError(err.message || "注册失败，请重试");
      } else {
        setError("注册失败，请重试");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="flex w-full max-w-md max-h-[calc(100vh-2rem)] flex-col rounded-2xl bg-white shadow-xl">
        {/* 固定头部 */}
        <div className="flex-shrink-0 px-8 pt-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600">
            <UserPlus className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">注册账户</h1>
          <p className="mt-2 text-sm text-gray-600">创建您的校园生存指北账户</p>
        </div>

        {/* 可滚动内容区域 */}
        <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
          {success ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">注册成功！</h2>
            <p className="text-sm text-gray-600">
              {formData.role === "STUDENT"
                ? "正在跳转到首页..."
                : formData.role === "ADMIN"
                ? "正在跳转到管理后台..."
                : "正在跳转到管理后台..."}
            </p>
          </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
            {/* 邮箱 */}
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
                邮箱 <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="example@email.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              />
            </div>

            {/* 昵称 */}
            <div>
              <label htmlFor="nickname" className="mb-2 block text-sm font-medium text-gray-700">
                昵称 <span className="text-red-500">*</span>
              </label>
              <input
                id="nickname"
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="请输入您的昵称"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              />
            </div>

            {/* 密码 */}
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
                密码 <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少 6 位字符"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
                minLength={6}
              />
            </div>

            {/* 确认密码 */}
            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-gray-700">
                确认密码 <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="请再次输入密码"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
                minLength={6}
              />
            </div>

            {/* 选择学校（仅学生显示） */}
            {formData.role === "STUDENT" && (
              <div>
                <label htmlFor="schoolId" className="mb-2 block text-sm font-medium text-gray-700">
                  选择学校 <span className="text-red-500">*</span>
                </label>
                <select
                  id="schoolId"
                  value={formData.schoolId}
                  onChange={(e) => setFormData({ ...formData, schoolId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  required
                >
                  <option value="">请选择学校</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 选择角色 - 使用 Tabs 样式 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                注册身份 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, role: "STUDENT", invitationCode: "" })}
                  className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    formData.role === "STUDENT"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  我是学生
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, role: "ADMIN", invitationCode: "" })}
                  className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    formData.role === "ADMIN"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  我是管理员
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, role: "STAFF", invitationCode: "" })}
                  className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    formData.role === "STAFF"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  我是工作人员
                </button>
              </div>
            </div>

            {/* 邀请码（仅 ADMIN 或 STAFF 显示） */}
            {showInvitationCode && (
              <div>
                <label htmlFor="invitationCode" className="mb-2 block text-sm font-medium text-gray-700">
                  邀请码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="invitationCode"
                    type="text"
                    value={formData.invitationCode}
                    onChange={(e) => setFormData({ ...formData, invitationCode: e.target.value.toUpperCase().trim() })}
                    placeholder="请输入邀请码"
                    className={`w-full rounded-lg border px-4 py-2.5 font-mono focus:outline-none focus:ring-2 ${
                      invitationCodeStatus?.valid === false
                        ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                        : invitationCodeStatus?.valid === true
                        ? "border-green-300 focus:border-green-500 focus:ring-green-200"
                        : showInvitationCode && !formData.invitationCode
                        ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                        : "border-gray-300 focus:border-blue-500 focus:ring-blue-200"
                    }`}
                    required={showInvitationCode}
                  />
                  {isCheckingInvitationCode && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                    </div>
                  )}
                </div>
                
                {/* 邀请码状态提示 */}
                {invitationCodeStatus && (
                  <p
                    className={`mt-1.5 flex items-start gap-1.5 text-xs ${
                      invitationCodeStatus.valid
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {invitationCodeStatus.valid ? (
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    )}
                    <span>{invitationCodeStatus.message}</span>
                  </p>
                )}
                
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>此角色注册需输入由上级发放的专属邀请码</span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  您的学校信息将由邀请码自动锁定
                </p>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !formData.email ||
                !formData.nickname ||
                !formData.password ||
                !formData.confirmPassword ||
                (formData.role === "STUDENT" && !formData.schoolId) ||
                (showInvitationCode && !formData.invitationCode)
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  注册中...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  注册
                </>
              )}
            </button>
          </form>
          )}
        </div>

        {/* 固定底部 */}
        <div className="flex-shrink-0 border-t border-gray-200 px-8 py-6 text-center">
          <p className="text-sm text-gray-600">
            已有账户？{" "}
            <a href="/login" className="font-medium text-blue-600 hover:text-blue-700">
              立即登录
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

