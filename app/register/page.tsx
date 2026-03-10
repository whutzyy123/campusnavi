"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/auth-server-actions";
import { getAgreementContent } from "@/lib/agreement-actions";
import { validateInvitationCode } from "@/lib/invitation-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { UserPlus, CheckCircle, AlertCircle, Loader2, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AgreementModal } from "@/components/auth/agreement-modal";
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
    roleType?: "ADMIN" | "STAFF";
    schoolId?: string;
    message?: string;
  } | null>(null);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [agreementModalContent, setAgreementModalContent] = useState<string>("");
  const [agreementModalTitle, setAgreementModalTitle] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAgreementLoading, setIsAgreementLoading] = useState(false);

  /** 邀请码已验证通过时，锁定学校和角色（Code-First） */
  const codeVerified = invitationCodeStatus?.valid === true;

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
        const { getSchoolsList } = await import("@/lib/school-actions");
        const result = await getSchoolsList();
        if (result.success && result.data) {
          setSchools(result.data);
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };

    fetchSchools();
  }, [setSchools]);

  /** 验证邀请码（Code-First：验证成功后立即锁定学校和角色） */
  const handleVerifyInvitationCode = async () => {
    const code = formData.invitationCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setInvitationCodeStatus({ valid: false, message: "请输入至少 4 位邀请码" });
      return;
    }

    setIsVerifyingCode(true);
    setInvitationCodeStatus(null);

    try {
      const result = await validateInvitationCode(code);

      if (result.valid) {
        // 立即更新状态，确保 UI 即时反映验证结果
        setInvitationCodeStatus({
          valid: true,
          schoolName: result.schoolName,
          roleType: result.roleType,
          schoolId: result.schoolId,
          message: `已匹配：${result.schoolName}`,
        });
        setFormData((prev) => ({
          ...prev,
          schoolId: result.schoolId,
          role: result.roleType,
          invitationCode: code,
        }));
        // 收起键盘并触发任何依赖 blur 的 UI 效果
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        toast.success(
          `邀请码有效！将加入 ${result.schoolName} 作为${result.roleType === "ADMIN" ? "校级管理员" : "工作人员"}`
        );
      } else {
        setInvitationCodeStatus({ valid: false, message: result.message });
        setFormData((prev) => ({
          ...prev,
          schoolId: "",
          role: "STUDENT",
        }));
      }
    } catch (error) {
      console.error("验证邀请码失败:", error);
      setInvitationCodeStatus({ valid: false, message: "验证失败，请稍后重试" });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  /** 查看协议/免责声明 */
  const handleViewAgreement = async (type: "user" | "disclaimer") => {
    setIsAgreementLoading(true);
    setAgreementModalTitle(type === "user" ? "用户协议" : "免责声明");
    setAgreementModalContent("");
    setIsModalOpen(true);

    const result = await getAgreementContent(type);
    if (result.success) {
      setAgreementModalContent(result.data);
    } else {
      toast.error(result.error || "文档未找到");
      setIsModalOpen(false);
    }
    setIsAgreementLoading(false);
  };

  /** 清空邀请码时重置 Code-First 状态 */
  const handleClearInvitationCode = () => {
    setFormData((prev) => ({ ...prev, invitationCode: "", schoolId: "", role: "STUDENT" }));
    setInvitationCodeStatus(null);
  };

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
      if (formData.schoolId) {
        formDataObj.append("schoolId", formData.schoolId);
      }
      if (formData.invitationCode) {
        formDataObj.append("invitationCode", formData.invitationCode.trim().toUpperCase());
      }
      formDataObj.append("agreed", isAgreed ? "true" : "false");

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
        const { getMe } = await import("@/lib/auth-server-actions");
        const meResult = await getMe();
        if (meResult.success && meResult.user) {
          setUser(meResult.user);
          if (meResult.user.schoolId) {
            const selectedSchool = schools.find((s) => s.id === meResult.user!.schoolId);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#FFF5F2] to-[#FFE5DD] p-4 py-10">
      <div className="my-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
        {/* 头部 */}
        <div className="px-8 pt-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF4500]">
            <UserPlus className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">注册账户</h1>
          <p className="mt-2 text-sm text-gray-600">创建您的校园生存指北账户</p>
        </div>

        {/* 表单内容区域 */}
        <div className="px-8 py-6">
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
                placeholder="请输入邮箱"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                required
                minLength={6}
              />
            </div>

            {/* 邀请码（可选）- Code-First 流程 */}
            <div>
              <label htmlFor="invitationCode" className="mb-2 block text-sm font-medium text-gray-700">
                邀请码（可选）
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    id="invitationCode"
                    type="text"
                    value={formData.invitationCode}
                    onChange={(e) =>
                      setFormData({ ...formData, invitationCode: e.target.value.toUpperCase().trim() })
                    }
                    placeholder="输入邀请码后点击验证"
                    disabled={codeVerified}
                    className={`w-full rounded-lg border px-4 py-2.5 font-mono focus:outline-none focus:ring-2 disabled:bg-gray-50 ${
                      invitationCodeStatus?.valid === false
                        ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                        : invitationCodeStatus?.valid === true
                        ? "border-green-300 focus:border-green-500 focus:ring-green-200"
                        : "border-gray-300 focus:border-[#FF4500] focus:ring-[#FF4500]/20"
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (codeVerified) {
                      handleClearInvitationCode();
                    } else {
                      handleVerifyInvitationCode();
                    }
                  }}
                  disabled={!codeVerified && (isVerifyingCode || !formData.invitationCode.trim())}
                  className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {!codeVerified && isVerifyingCode ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>验证中</span>
                    </>
                  ) : codeVerified ? (
                    "清除"
                  ) : (
                    "验证"
                  )}
                </button>
              </div>

              {codeVerified && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    ✅ 邀请码有效！将加入 <strong>{invitationCodeStatus?.schoolName}</strong> 作为
                    <strong>{formData.role === "ADMIN" ? "校级管理员" : "工作人员"}</strong>
                  </span>
                </div>
              )}
              {invitationCodeStatus?.valid === false && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{invitationCodeStatus.message}</span>
                </p>
              )}
            </div>

            {/* 选择角色和学校（邀请码验证通过时锁定显示，否则可编辑） */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                注册身份 <span className="text-red-500">*</span>
                {codeVerified && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-amber-600">
                    <Lock className="h-3.5 w-3.5" />
                    已由邀请码锁定
                  </span>
                )}
              </label>
              {codeVerified ? (
                /* 邀请码锁定：只读展示 */
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
                    {formData.role === "ADMIN" ? "我是管理员" : formData.role === "STAFF" ? "我是工作人员" : "我是学生"}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">所属学校</label>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
                      {invitationCodeStatus?.schoolName ?? "—"}
                    </div>
                  </div>
                </div>
              ) : (
                /* 未验证：可编辑 */
                <>
                  <div className="flex gap-2 border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: "STUDENT", schoolId: "" })}
                      className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                        formData.role === "STUDENT"
                          ? "border-[#FF4500] text-[#FF4500]"
                          : "border-transparent text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      我是学生
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: "ADMIN", schoolId: "" })}
                      className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                        formData.role === "ADMIN"
                          ? "border-[#FF4500] text-[#FF4500]"
                          : "border-transparent text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      我是管理员
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: "STAFF", schoolId: "" })}
                      className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                        formData.role === "STAFF"
                          ? "border-[#FF4500] text-[#FF4500]"
                          : "border-transparent text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      我是工作人员
                    </button>
                  </div>

                  {/* 选择学校（仅学生显示） */}
                  {formData.role === "STUDENT" && (
                    <div className="mt-4">
                      <label htmlFor="schoolId" className="mb-2 block text-sm font-medium text-gray-700">
                        选择学校 <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="schoolId"
                        value={formData.schoolId}
                        onChange={(e) => setFormData({ ...formData, schoolId: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                        required={formData.role === "STUDENT"}
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

                  {formData.role !== "STUDENT" && (
                    <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>管理员/工作人员需先输入并验证邀请码</span>
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 协议勾选 */}
            <div className="flex flex-row items-start gap-2">
              <Checkbox
                checked={isAgreed}
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                我已阅读并同意{" "}
                <button
                  type="button"
                  onClick={() => handleViewAgreement("user")}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  用户协议
                </button>{" "}
                与{" "}
                <button
                  type="button"
                  onClick={() => handleViewAgreement("disclaimer")}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  免责条款
                </button>
              </span>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !isAgreed ||
                !formData.email ||
                !formData.nickname ||
                !formData.password ||
                !formData.confirmPassword ||
                (formData.role === "STUDENT" && !formData.schoolId) ||
                ((formData.role === "ADMIN" || formData.role === "STAFF") && !codeVerified)
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* 协议弹窗 */}
        <AgreementModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={agreementModalTitle}
          content={agreementModalContent}
          isLoading={isAgreementLoading}
        />

        {/* 底部 */}
        <div className="border-t border-gray-200 px-8 py-6 text-center">
          <p className="text-sm text-gray-600">
            已有账户？{" "}
            <a href="/login" className="font-medium text-[#FF4500] hover:opacity-90">
              立即登录
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

