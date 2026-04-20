"use client";

import React, { memo, useState, useEffect, useCallback, forwardRef } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import type { User } from "@/store/use-auth-store";

export interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  reportCount: number;
  isHidden: boolean;
  parentId?: string | null;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    email?: string | null;
  };
  parent?: {
    id: string;
    user: {
      id: string;
      nickname: string | null;
    };
  } | null;
  replies?: CommentItem[];
}

/** 将嵌套回复展平为单层数组（按时间正序） */
export function flattenReplies(comments: CommentItem[]): CommentItem[] {
  const result: CommentItem[] = [];
  const visit = (list: CommentItem[]) => {
    for (const c of list) {
      result.push(c);
      if (c.replies && c.replies.length > 0) {
        visit(c.replies);
      }
    }
  };
  visit(comments);
  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** 自动调整高度的留言输入框（max 150px） */
export const CommentTextarea = forwardRef<HTMLTextAreaElement | null, React.ComponentProps<"textarea">>(
  function CommentTextarea({ value, onChange, placeholder, ...props }, ref) {
    const adjustHeight = useCallback((el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }, []);

    const setRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        adjustHeight(node);
      },
      [ref, adjustHeight]
    );

    useEffect(() => {
      const el = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
      if (el) adjustHeight(el);
    }, [value, ref, adjustHeight]);

    return (
      <textarea
        ref={setRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={2}
        className="min-h-[60px] max-h-[150px] w-full resize-none overflow-y-auto rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
        {...props}
      />
    );
  }
);

interface CommentBlockProps {
  root: CommentItem;
  currentUser: User | null;
  isAuthenticated: boolean;
  highlightedCommentId?: string | null;
  onAvatarClick?: (userId: string) => void;
  onReplyClick: (comment: CommentItem) => void;
  onLikeClick: (commentId: string) => void | Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onReportComment: (id: string) => Promise<void>;
}

export const CommentBlock = memo(function CommentBlock({
  root,
  currentUser,
  isAuthenticated,
  highlightedCommentId,
  onAvatarClick,
  onReplyClick,
  onLikeClick,
  onDeleteComment,
  onReportComment,
}: CommentBlockProps) {
  const [isReporting, setIsReporting] = useState<Record<string, boolean>>({});
  const flatReplies = flattenReplies(root.replies || []);

  const renderCommentRow = (comment: CommentItem, isReply: boolean) => {
    const isHidden = comment.isHidden;
    const canDelete =
      currentUser &&
      (currentUser.id === comment.user.id ||
        ["ADMIN", "STAFF", "SUPER_ADMIN"].includes(String(currentUser.role)));
    const isHighlighted = highlightedCommentId === comment.id;

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`transition-colors duration-300 ${isReply ? "py-2 first:pt-0 last:pb-0" : ""} ${
          isHighlighted
            ? "animate-comment-highlight rounded-lg bg-[#FFE5DD]/60 px-2 py-1.5 ring-2 ring-[#FF4500]/40 ring-offset-2"
            : ""
        }`}
      >
        <div className="flex gap-2">
          {!isReply && (
            <button
              type="button"
              onClick={() => onAvatarClick?.(comment.user.id)}
              className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#EDEFF1] text-xs font-semibold text-[#1A1A1B] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#FF4500]/40"
              title="查看资料"
            >
              {comment.user.avatar ? (
                <Image
                  src={comment.user.avatar}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                  unoptimized={comment.user.avatar.startsWith("blob:")}
                />
              ) : (
                (comment.user.nickname || comment.user.email?.split("@")[0] || "游客").slice(0, 2)
              )}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAvatarClick?.(comment.user.id)}
                className="text-left font-medium text-slate-800 hover:text-[#FF4500] hover:underline focus:outline-none focus:ring-0"
                title="查看资料"
              >
                {comment.user.nickname || comment.user.email?.split("@")[0] || "匿名用户"}
              </button>
              <span className="text-[10px] text-[#7C7C7C] shrink-0">
                {new Date(comment.createdAt).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div
              className={`whitespace-pre-line break-words text-sm ${isHidden ? "text-[#7C7C7C] italic" : "text-[#1A1A1B]"}`}
            >
              {isHidden ? (
                "此评论已被折叠"
              ) : comment.parent ? (
                <>
                  回复 <span className="text-[#FF4500]">@{comment.parent.user.nickname || "匿名用户"}</span>:{" "}
                  {comment.content}
                </>
              ) : (
                comment.content
              )}
            </div>
            {!isHidden && (
              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                <button
                  type="button"
                  onClick={() => onLikeClick(comment.id)}
                  className={`inline-flex items-center gap-1 transition-colors hover:text-[#1A1A1B] ${
                    (comment.isLikedByMe ?? false) ? "text-red-500" : ""
                  }`}
                >
                  <Heart className={`h-4 w-4 ${(comment.isLikedByMe ?? false) ? "fill-current" : ""}`} />
                  <span>{(comment.likeCount ?? 0) > 0 ? comment.likeCount : "赞"}</span>
                </button>
                {isAuthenticated && (
                  <button onClick={() => onReplyClick(comment)} className="hover:text-[#1A1A1B]">
                    {"\u21A9 "}回复
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (isReporting[comment.id]) return;
                    setIsReporting((p) => ({ ...p, [comment.id]: true }));
                    try {
                      await onReportComment(comment.id);
                    } finally {
                      setIsReporting((p) => ({ ...p, [comment.id]: false }));
                    }
                  }}
                  disabled={isReporting[comment.id]}
                  className="hover:text-[#1A1A1B] disabled:opacity-50"
                >
                  {isReporting[comment.id] ? "举报中..." : "\uD83D\uDEA9 举报"}
                </button>
                {canDelete && (
                  <button onClick={() => onDeleteComment(comment.id)} className="hover:text-red-600">
                    {"\uD83D\uDDD1 删除"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {renderCommentRow(root, false)}
      {flatReplies.length > 0 && (
        <div className="ml-10 mt-1 rounded-lg bg-gray-50 p-2">
          {flatReplies.map((reply) => renderCommentRow(reply, true))}
        </div>
      )}
    </div>
  );
});
