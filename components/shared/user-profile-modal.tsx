"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, User } from "lucide-react";
import { getPublicProfile, type PublicProfile } from "@/lib/user-actions";
import { cn } from "@/lib/utils";

interface UserProfileModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileModal({ userId, isOpen, onClose }: UserProfileModalProps) {
  const [state, setState] = useState<{
    profile: PublicProfile | null;
    loading: boolean;
    error: string | null;
  }>({ profile: null, loading: false, error: null });

  useEffect(() => {
    if (!isOpen || !userId) {
      setState({ profile: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    getPublicProfile(userId).then((result) => {
      if (result.success && result.data) {
        setState({ profile: result.data, loading: false, error: null });
      } else {
        setState({ profile: null, loading: false, error: result.error || "加载失败" });
      }
    });
  }, [isOpen, userId]);

  const { profile, loading, error } = state;

  if (!isOpen) return null;

  const content = (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center p-4",
        "bg-black/50"
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "z-[210] relative modal-container max-w-sm",
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "max-h-[min(90vh,calc(100vh-40px))]"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-modal-title"
      >
        <div className="modal-header flex items-center justify-between px-4 py-3">
          <span id="user-profile-modal-title" className="text-sm font-medium text-gray-500">用户资料</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body p-6 scrollbar-gutter-stable">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
              <p className="mt-3 text-sm text-gray-500">加载中...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-600">{error}</div>
          ) : profile ? (
            <div className="flex flex-col items-center">
              <div className="relative mb-4">
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt=""
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-full object-cover ring-4 ring-[#FFE5DD]"
                    unoptimized={profile.avatarUrl.startsWith("blob:")}
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#EDEFF1] ring-4 ring-[#FFE5DD]">
                    <User className="h-12 w-12 text-[#7C7C7C]" />
                  </div>
                )}
              </div>
              <h3 className="text-lg font-semibold text-[#1A1A1B]">
                {profile.nickname || "匿名用户"}
              </h3>
              {profile.marketThumbsUpRate != null && (
                <p className="mt-1 text-sm text-gray-600">
                  好评率 <span className="font-medium text-green-600">{profile.marketThumbsUpRate}%</span>
                </p>
              )}
              {profile.bio ? (
                <p className="mt-3 w-full whitespace-pre-wrap rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {profile.bio}
                </p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">暂无个人简介</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
