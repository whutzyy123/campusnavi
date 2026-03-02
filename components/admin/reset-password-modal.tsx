"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Eye, EyeOff, KeyRound, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 6;

export interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userNickname?: string | null;
  onReset: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  userId,
  userNickname,
  onReset,
}: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const passwordsMatch = newPassword === confirmPassword;
  const isPasswordLongEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  const canSubmit =
    newPassword.trim().length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.trim().length >= MIN_PASSWORD_LENGTH &&
    passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await onReset(userId, newPassword);
      if (result.success) {
        handleClose();
      } else {
        setError(result.message);
      }
    } catch {
      setError("重置失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-modal-overlay flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="modal-container w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <KeyRound className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">重置密码</h3>
                <p className="text-sm text-gray-500">
                  为 {userNickname || "该用户"} 设置新密码
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Warning */}
          <div className="mx-6 mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>此操作将立即生效，用户需使用新密码登录。</span>
          </div>

          {/* Body */}
          <div className="space-y-4 px-6 py-5">
            {/* New Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                新密码 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`至少 ${MIN_PASSWORD_LENGTH} 个字符`}
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={isSubmitting}
                  className={cn(
                    "w-full rounded-lg border py-2.5 pr-10 pl-4 text-sm",
                    "focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "border-gray-300"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showNewPassword ? "隐藏密码" : "显示密码"}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {newPassword && !isPasswordLongEnough && (
                <p className="mt-1 text-xs text-amber-600">
                  密码长度至少为 {MIN_PASSWORD_LENGTH} 个字符
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                确认新密码 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={isSubmitting}
                  className={cn(
                    "w-full rounded-lg border py-2.5 pr-10 pl-4 text-sm",
                    "focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    confirmPassword && !passwordsMatch
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-gray-300"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "重置中..." : "重置密码"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
