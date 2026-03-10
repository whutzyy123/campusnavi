"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { loginUser } from "@/lib/auth-server-actions";
import { useAuthStore, type UserRole } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { LogIn, Mail, Lock, AlertCircle } from "lucide-react";

/**
 * 登录页面（邮箱 + 密码）
 * 使用 Server Actions 进行认证
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner className="flex min-h-screen items-center justify-center" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { initializeAuth, isInitialized, currentUser, setUser } = useAuthStore();
  const { setActiveSchool, schools } = useSchoolStore();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载学校列表（用于设置当前学校）
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const { getSchoolsList } = await import("@/lib/school-actions");
        const result = await getSchoolsList();
        if (result.success && result.data) {
          useSchoolStore.getState().setSchools(result.data);
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };

    fetchSchools();
  }, []);

  // 加载当前用户信息（如果已登录），并避免在未登录时反复 401
  // 使用统一的初始化逻辑
  
  useEffect(() => {
    if (!isInitialized) {
      initializeAuth();
    }
  }, [isInitialized, initializeAuth]);

  // 如果已登录，根据角色跳转到相应页面（避免已登录用户访问登录页）
  useEffect(() => {
    if (isInitialized && currentUser) {
      const searchParams = new URLSearchParams(window.location.search);
      let target = searchParams.get("redirect") || "/";
      
      if (currentUser.role === "SUPER_ADMIN") {
        target = "/super-admin";
      } else if (currentUser.role === "ADMIN" || currentUser.role === "STAFF") {
        target = "/admin";
      }
      
      router.push(target);
    }
  }, [isInitialized, currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.email.trim() || !formData.password) {
      setError("请填写邮箱和密码");
      return;
    }

    setIsSubmitting(true);

    try {
      // 创建 FormData
      const formDataObj = new FormData();
      formDataObj.append("email", formData.email.trim());
      formDataObj.append("password", formData.password);

      // 调用 Server Action 执行登录逻辑
      const result = await loginUser(formDataObj);

      if (!result || !result.success || !result.user) {
        setError(result?.message || "登录失败");
        return;
      }

      const user = result.user;
      setUser({
        id: user.id,
        email: user.email ?? undefined,
        nickname: user.nickname ?? "",
        role: user.role as UserRole,
        schoolId: user.schoolId,
        schoolName: user.schoolName ?? undefined,
      });

      // 如果用户有学校，设置当前学校
      if (user.schoolId) {
        const userSchool = schools.find((s) => s.id === user.schoolId);
        if (userSchool) {
          setActiveSchool(userSchool);
        }
      }

      // 根据角色决定跳转目标
      let target = searchParams.get("redirect") || "/";
      if (user.role === "SUPER_ADMIN") {
        target = "/super-admin";
      } else if (user.role === "ADMIN" || user.role === "STAFF") {
        target = "/admin";
      }

      router.push(target);
    } catch (err) {
      console.error("Login client error:", err);
      setError("登录失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#FFF5F2] to-[#FFE5DD]">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF4500]">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">登录账户</h1>
          <p className="mt-2 text-sm text-gray-600">使用邮箱和密码登录</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 邮箱 */}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              邮箱 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="请输入邮箱"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pl-10 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* 密码 */}
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
              密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pl-10 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

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
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                登录中...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                登录
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            还没有账户？{" "}
            <a href="/register" className="font-medium text-[#FF4500] hover:opacity-90">
              立即注册
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
