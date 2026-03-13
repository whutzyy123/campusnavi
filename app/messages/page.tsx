"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  getUserNotifications,
  markAsRead,
  markAsReadMultiple,
  markAllAsRead,
  markAsReadByEntityTypes,
  type NotificationItem,
} from "@/lib/notification-actions";
import { submitQuickReply } from "@/lib/comment-actions";
import { AuthGuard } from "@/components/auth-guard";
import { useAuthStore } from "@/store/use-auth-store";
import { useNotificationStore } from "@/store/use-notification-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { truncateText } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  User,
  Loader2,
  MessageCircle,
  Send,
  ShoppingBag,
  CheckCheck,
  ChevronLeft,
  Bell,
  MapPin,
} from "lucide-react";

/** 格式化点赞者名称 */
function formatActorNames(
  actorNames: string[],
  totalCount: number,
  isSmallScreen: boolean
): string {
  if (totalCount <= 0) return "";
  if (isSmallScreen || actorNames.length <= 1) {
    const name = actorNames[0] || "匿名用户";
    return totalCount > 1 ? `${name} 等 ${totalCount} 人` : name;
  }
  if (totalCount <= 2) return actorNames.slice(0, 2).join("、");
  return `${actorNames.slice(0, 2).join("、")} 等 ${totalCount} 人`;
}

/** 相对时间 */
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

function getNotificationActionLabel(type: string, entityType?: string): string {
  if (entityType === "MARKET_ITEM") return "生存集市";
  switch (type) {
    case "LIKE":
      return "赞了你的留言";
    case "REPLY":
      return "回复了你的留言";
    case "MENTION":
      return "在留言中提到了你";
    case "SYSTEM":
      return "系统消息";
    case "LOST_FOUND_FOUND":
      return "标记了你的失物招领为已找到";
    default:
      return "通知";
  }
}

function getNotificationDisplayText(
  n: NotificationItem,
  isSmallScreen: boolean
): React.ReactNode {
  if (n.type === "LIKE" && n.actorNames && n.totalActorCount != null) {
    const namesStr = formatActorNames(
      n.actorNames,
      n.totalActorCount,
      isSmallScreen
    );
    return (
      <>
        <span className="font-medium">{namesStr}</span>
        赞了你的留言
      </>
    );
  }
  if (n.type === "REPLY") {
    return (
      <>
        <span className="font-medium">{n.actor?.nickname || "匿名用户"}</span>{" "}
        回复了你的留言
      </>
    );
  }
  if (n.actor) {
    return (
      <>
        <span className="font-medium">{n.actor.nickname || "匿名用户"}</span>{" "}
        {getNotificationActionLabel(n.type, n.entityType)}
      </>
    );
  }
  return n.message || getNotificationActionLabel(n.type, n.entityType);
}

function MessagesContent() {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const { messagesUnread, fetchUnreadCounts } = useNotificationStore();
  const isSmallScreen = !useMediaQuery("(min-width: 480px)");

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    const result = await getUserNotifications(currentUser.id, 50, ["MARKET_ITEM"]);
    setLoading(false);
    if (result.success && result.data) {
      setNotifications(result.data);
      await fetchUnreadCounts(currentUser.id);
    } else {
      toast.error(result.error || "获取消息失败");
    }
  }, [currentUser?.id, fetchUnreadCounts]);

  useEffect(() => {
    if (currentUser?.id) fetchNotifications();
  }, [currentUser?.id, fetchNotifications]);

  const handleMarkAsRead = async (n: NotificationItem) => {
    const result = n.notificationIds?.length
      ? await markAsReadMultiple(n.notificationIds)
      : await markAsRead(n.id);
    if (result.success && currentUser?.id) {
      const idsToMark = n.notificationIds ?? [n.id];
      setNotifications((prev) =>
        prev.map((item) =>
          idsToMark.includes(item.id) || item.id === n.id
            ? { ...item, isRead: true }
            : item
        )
      );
      await fetchUnreadCounts(currentUser.id);
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (n.entityType === "MARKET_ITEM" && n.entityId) {
      await handleMarkAsRead(n);
      const view = n.message?.includes("选定您为买家") ? "&view=buying" : "";
      router.push(`/center/market?openItemId=${n.entityId}${view}`);
      return;
    }
    if (n.entityType === "COMMENT" && (n.type === "REPLY" || n.type === "LIKE")) {
      const poiId = n.poiId;
      const commentId = n.entityId || n.commentId;
      if (!poiId || !commentId) {
        toast.error("无法定位到该留言");
        await handleMarkAsRead(n);
        return;
      }
      router.push(
        `/?poiId=${poiId}&openDrawer=true&highlightCommentId=${commentId}`
      );
    }
    await handleMarkAsRead(n);
  };

  const handleQuickReply = async (
    poiId: string,
    parentId: string,
    notificationId: string
  ) => {
    const content = replyContent.trim();
    if (!content || content.length > 500) {
      toast.error("回复内容不能为空且最多 500 字");
      return;
    }
    setIsSubmittingReply(true);
    try {
      const result = await submitQuickReply(
        poiId,
        parentId,
        content,
        notificationId
      );
      if (result.success) {
        toast.success("回复已发送");
        setReplyingToId(null);
        setReplyContent("");
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notificationId ? { ...item, isRead: true } : item
          )
        );
        if (currentUser?.id) await fetchUnreadCounts(currentUser.id);
      } else {
        toast.error(result.error || "发送失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const handleMarkAllAsRead = async () => {
    if (!currentUser?.id) return;
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    if (unreadCount === 0) {
      toast.success("暂无未读消息");
      return;
    }
    setIsMarkingAll(true);
    try {
      const result = await markAllAsRead(currentUser.id);
      if (result.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        await fetchUnreadCounts(currentUser.id);
        toast.success(`已一键标为已读（${unreadCount} 条）`);
      } else {
        toast.error(result.error || "操作失败");
      }
    } finally {
      setIsMarkingAll(false);
    }
  };

  const hasUnread = notifications.some((n) => !n.isRead);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-[#F8F9FA]">
      {/* 固定头部 */}
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[#EDEFF1] bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-[#FF4500]"
            aria-label="返回"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF4500]/10">
              <Bell className="h-5 w-5 text-[#FF4500]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#1A1A1B]">消息</h1>
              <p className="text-xs text-[#7C7C7C]">
                {hasUnread ? `${unreadCount} 条未读` : "全部已读"}
              </p>
            </div>
          </div>
        </div>
        {hasUnread && (
          <button
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll}
            className="flex items-center gap-1.5 rounded-full bg-[#FF4500]/10 px-3 py-1.5 text-sm font-medium text-[#FF4500] transition-colors hover:bg-[#FF4500]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMarkingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            一键已读
          </button>
        )}
      </header>

      {/* 消息列表 */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-[#FF4500]" />
            <p className="mt-4 text-sm text-[#7C7C7C]">加载中...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EDEFF1]">
              <Bell className="h-10 w-10 text-[#C4C7CC]" />
            </div>
            <h2 className="mt-6 text-lg font-medium text-[#1A1A1B]">暂无消息</h2>
            <p className="mt-2 text-center text-sm text-[#7C7C7C]">
              留言回复、点赞、集市通知等都会出现在这里
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#FF4500] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E03D00]"
            >
              <MapPin className="h-4 w-4" />
              去逛逛地图
            </Link>
          </div>
        ) : (
          <>
          <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`overflow-hidden rounded-2xl bg-white shadow-sm transition-all ${
                    !n.isRead ? "ring-1 ring-[#FF4500]/20" : ""
                  } ${
                    n.entityType === "COMMENT" &&
                    (n.type === "REPLY" || n.type === "LIKE")
                      ? "cursor-pointer hover:shadow-md"
                      : "hover:shadow-md"
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(n)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleNotificationClick(n)
                    }
                    className="flex gap-4 p-4"
                  >
                    <div className="relative shrink-0">
                      {n.actor?.avatar ? (
                        <Image
                          src={n.actor.avatar}
                          alt=""
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-full object-cover"
                          unoptimized={n.actor.avatar.startsWith("blob:")}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDEFF1]">
                          <User className="h-6 w-6 text-[#7C7C7C]" />
                        </div>
                      )}
                      {!n.isRead && (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#FF4500]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          !n.isRead ? "font-semibold text-[#1A1A1B]" : "text-[#1A1A1B]"
                        }`}
                      >
                        {getNotificationDisplayText(n, isSmallScreen)}
                      </p>

                      {n.type === "REPLY" && n.replyContent && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-[#7C7C7C]">
                          {truncateText(n.replyContent, 120)}
                        </p>
                      )}

                      {(n.type === "LIKE" || n.type === "REPLY") &&
                        n.entityType === "COMMENT" &&
                        n.poiId &&
                        (n.entityId || n.commentId) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const commentId = n.entityId || n.commentId;
                              router.push(
                                `/?poiId=${n.poiId}&openDrawer=true&highlightCommentId=${commentId}`
                              );
                            }}
                            className="mt-2 block w-full rounded-lg bg-[#F6F7F8] p-2.5 text-left text-xs text-[#7C7C7C] transition-colors hover:bg-[#EDEFF1] hover:text-[#1A1A1B]"
                          >
                            {n.originalCommentContent
                              ? truncateText(n.originalCommentContent, 80)
                              : "点击查看回复"}
                          </button>
                        )}

                      {n.message &&
                        n.type !== "REPLY" &&
                        n.type !== "LIKE" && (
                          <p className="mt-1 line-clamp-2 text-xs text-[#7C7C7C]">
                            {n.message}
                          </p>
                        )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="text-xs text-[#7C7C7C]">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                        {n.entityType === "MARKET_ITEM" && n.entityId && (
                          <Link
                            href={`/center/market?openItemId=${n.entityId}${n.message?.includes("选定您为买家") ? "&view=buying" : ""}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#FF4500] hover:underline"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" />
                            查看商品
                          </Link>
                        )}
                        {n.type === "REPLY" && n.poiId && n.commentId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyingToId(replyingToId === n.id ? null : n.id);
                              setReplyContent("");
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#FF4500] hover:underline"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            回复
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {replyingToId === n.id && n.poiId && n.commentId && (
                    <div
                      className="border-t border-[#EDEFF1] bg-[#F8F9FA] p-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="输入回复内容..."
                        maxLength={500}
                        rows={3}
                        className="mb-3 w-full resize-none rounded-xl border border-[#EDEFF1] bg-white px-4 py-3 text-sm placeholder:text-[#7C7C7C] focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[#7C7C7C]">
                          {replyContent.length}/500
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickReply(n.poiId!, n.commentId!, n.id)
                          }
                          disabled={isSubmittingReply || !replyContent.trim()}
                          className="flex items-center gap-2 rounded-xl bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSubmittingReply ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          发送
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 底部一键已读浮动栏：有未读时显示 */}
          {hasUnread && (
            <div
              className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#EDEFF1] bg-white/95 px-4 py-3 backdrop-blur-sm"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <button
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAll}
                className="flex w-full max-w-2xl mx-auto items-center justify-center gap-2 rounded-xl bg-[#FF4500] py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isMarkingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4" />
                )}
                一键已读（{unreadCount} 条未读）
              </button>
            </div>
          )}
          </>
        )}
      </main>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <MessagesContent />
    </AuthGuard>
  );
}
