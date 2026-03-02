"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import Link from "next/link";
import Image from "next/image";
import { updateProfile, updateEmail, updatePassword } from "@/lib/profile-actions";
import { deleteMyAccount } from "@/lib/user-actions";
import { getUserLostFoundEvents } from "@/lib/lost-found-actions";
import {
  getUserNotifications,
  getUserMarketNotifications,
  markAsRead,
  markAsReadMultiple,
  markAllAsRead,
  markAsReadByEntityTypes,
  type NotificationItem,
} from "@/lib/notification-actions";
import { submitQuickReply } from "@/lib/comment-actions";
import {
  lockMarketItem,
  unlockMarketItem,
  selectBuyerAndLock,
  confirmTransaction,
  rateMarketTransaction,
  getMarketThumbsUpRate,
  deleteMarketItem,
  withdrawIntention,
  submitIntention,
  getMarketItemDetail,
  getMyMarketItems,
  getMarketCategories,
} from "@/lib/market-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { useNotificationStore } from "@/store/use-notification-store";
import { AuthGuard } from "@/components/auth-guard";
import toast from "react-hot-toast";
import { User, Mail, Lock, Save, Loader2, AlertTriangle, Package, MapPin, ExternalLink, MessageSquare, MessageCircle, Send, Clock, ShoppingBag, LockKeyhole, RotateCcw, CheckCircle, Info, Pencil, Heart, Trash2, Eye, Phone, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp } from "lucide-react";
import { MarketItemDetailModal, type MarketItemDetailData } from "@/components/market/market-item-detail-modal";
import { PostItemModal, type MarketCategoriesByType, type TransactionTypeItem } from "@/components/market/post-item-modal";
import { UserProfileModal } from "@/components/shared/user-profile-modal";
import { ImageUpload } from "@/components/shared/image-upload";
import { EmptyState } from "@/components/empty-state";
import { useMediaQuery } from "@/hooks/use-media-query";
import { truncateText } from "@/lib/utils";

type MarketSubTab = "posted" | "interested" | "locked" | "acquired" | "history";
type MarketRole = "seller" | "buyer";
type MarketStatusFilter = "all" | "ongoing" | "ended";

const SELLING_STATUS_FILTERS: { id: MarketStatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "ongoing", label: "进行中" },
  { id: "ended", label: "已结束" },
];

const BUYING_STATUS_FILTERS: { id: MarketStatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "ongoing", label: "进行中" },
  { id: "ended", label: "已结束" },
];

/** 根据买家侧 item 推断 subTab（用于卡片操作按钮） */
function getBuyerSubTab(item: MarketTransactionItem, currentUserId: string): MarketSubTab {
  if (item.status === "LOCKED" && item.selectedBuyerId === currentUserId) return "locked";
  if (item.status === "COMPLETED" && item.selectedBuyerId === currentUserId) return "acquired";
  if (item.status === "ACTIVE" && (item.hasIntention ?? true) && item.selectedBuyerId !== currentUserId) return "interested";
  return "history";
}

/** 格式化点赞者名称："xxx, yyy and 5 others"；小屏仅 "xxx and 5 others" */
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
  if (totalCount <= 2) {
    return actorNames.slice(0, 2).join("、");
  }
  return `${actorNames.slice(0, 2).join("、")} 等 ${totalCount} 人`;
}

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

/** 消息列表用相对时间，如 "5分钟前" */
function formatRelativeTimeShort(isoString: string): string {
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


/** 通知主文案（分组点赞 / 回复 / 默认），需传入 isSmallScreen 以适配 formatActorNames */
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
        <span className="font-medium">
          {n.actor?.nickname || "匿名用户"}
        </span>
        {" "}
        回复了你的留言
      </>
    );
  }
  if (n.actor) {
    return (
      <>
        <span className="font-medium">
          {n.actor.nickname || "匿名用户"}
        </span>
        {" "}
        {getNotificationActionLabel(n.type, n.entityType)}
      </>
    );
  }
  return n.message || getNotificationActionLabel(n.type, n.entityType);
}

/** 通知类型对应的动作文案（用于默认展示） */
function getNotificationActionLabel(type: string, entityType?: string): string {
  if (entityType === "MARKET_ITEM") {
    return "生存集市";
  }
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

/** 集市交易商品卡片（按 subTab 显示不同操作） */
function MarketTransactionCard({
  item,
  role,
  subTab,
  currentUserId,
  onUnlock,
  onConfirm,
  onRate,
  onViewDetails,
  onEdit,
  onDelete,
  onWithdrawIntention,
  onReAddIntention,
  actionId,
  ratingId,
  formatTime,
  isHighlighted,
}: {
  item: MarketTransactionItem;
  role: "seller" | "buyer";
  subTab: MarketSubTab;
  currentUserId: string;
  onUnlock?: (id: string) => void;
  onConfirm: (id: string) => void;
  onRate?: (itemId: string, isPositive: boolean) => void;
  onViewDetails: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onWithdrawIntention?: (id: string) => void;
  onReAddIntention?: (id: string) => void;
  actionId: string | null;
  ratingId: string | null;
  formatTime: (s: string) => string;
  isHighlighted?: boolean;
}) {
  const isLocked = item.status === "LOCKED";
  const isCompleted = item.status === "COMPLETED";
  const isActive = item.status === "ACTIVE";
  const isExpired = item.status === "EXPIRED";

  /** 买家视角：不可用（已售出/已失效/已下架/被他人锁定） */
  const isUnavailable =
    role === "buyer" &&
    ((isCompleted && item.selectedBuyerId !== currentUserId) ||
      isExpired ||
      item.status === "DELETED" ||
      item.isHidden === true ||
      (isLocked && item.selectedBuyerId !== currentUserId));

  /** 不可用原因（用于居中徽章文案） */
  const unavailableReason: "sold" | "expired" | "removed" | "locked" | null =
    role === "buyer"
      ? isLocked && item.selectedBuyerId !== currentUserId
        ? "locked"
        : isCompleted && item.selectedBuyerId !== currentUserId
          ? "sold"
          : isExpired
            ? "expired"
            : item.status === "DELETED" || item.isHidden === true
              ? "removed"
              : null
      : null;

  /** 买家视角：锁定给我，显示「交易锁定中 - 请联系卖家」 */
  const isLockedForMe = role === "buyer" && isLocked && item.selectedBuyerId === currentUserId;

  const myConfirmed = role === "seller" ? item.sellerConfirmed : item.buyerConfirmed;
  const confirmStatusText = isLocked && !isCompleted
    ? myConfirmed
      ? "你已确认"
      : "等待对方确认"
    : null;

  const loading = actionId === item.id;

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const btnPrimary = `${btn} bg-[#FF4500] text-white transition-colors hover:opacity-90`;
  const btnSecondary = `${btn} border border-[#EDEFF1] bg-white text-[#1A1A1B] transition-colors hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]`;
  const btnDanger = `${btn} border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50`;

  const unavailableBadgeLabel =
    unavailableReason === "sold"
      ? "已售出"
      : unavailableReason === "expired"
        ? "已失效"
        : unavailableReason === "removed"
          ? "已下架"
          : unavailableReason === "locked"
            ? "已被他人锁定"
            : null;

  /** 统一状态徽章：在售/交易中/已完成/已过期/已下架 */
  const statusBadge =
    item.status === "DELETED" || item.isHidden === true
      ? { label: "已下架", className: "bg-slate-100 text-slate-600" }
      : isCompleted
        ? { label: "已完成", className: "bg-green-100 text-green-800" }
        : isLocked
          ? { label: "交易中", className: "bg-amber-100 text-amber-800" }
          : isExpired
            ? { label: "已过期", className: "bg-gray-100 text-gray-600" }
            : { label: "在售", className: "bg-blue-100 text-blue-800" };

  return (
    <div
      className={`rounded-lg border p-4 transition-all duration-300 hover:border-[#FFE5DD] ${
        isHighlighted
          ? "border-[#FF4500] ring-2 ring-[#FF4500]/40 shadow-[0_0_0_3px_rgba(255,69,0,0.15)]"
          : "border-[#EDEFF1]"
      }`}
    >
      <div className="flex gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {item.images[0] ? (
            <Image
              src={item.images[0]}
              alt={item.title}
              fill
              className={`object-cover transition-all ${isUnavailable ? "grayscale opacity-50" : ""}`}
              sizes="80px"
              unoptimized={item.images[0].startsWith("blob:")}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center text-gray-400 transition-all ${isUnavailable ? "opacity-50" : ""}`}>
              <ShoppingBag className="h-8 w-8" />
            </div>
          )}
          {isUnavailable && (
            <>
              <div className="absolute inset-0 bg-slate-200/30" aria-hidden />
              {unavailableBadgeLabel && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                    {unavailableBadgeLabel}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <div className={`min-w-0 flex-1 ${isUnavailable ? "opacity-70" : ""}`}>
          <h3 className="line-clamp-2 font-medium text-[#1A1A1B]">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#7C7C7C]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{item.poi?.name ?? "—"}</span>
            <span>·</span>
            <span>{item.transactionType?.name ?? "—"}</span>
            {item.transactionType?.code === "SALE" && item.price != null && (
              <>
                <span>·</span>
                <span className="font-medium text-[#FF4500]">¥{item.price}</span>
              </>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#7C7C7C]">{formatTime(item.createdAt)}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            {isCompleted && subTab === "acquired" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                <CheckCircle className="h-3.5 w-3.5" />
                交易已完成
              </span>
            )}
          </div>

          {/* 买家：交易锁定中 - 请联系卖家 */}
          {isLockedForMe && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <LockKeyhole className="h-4 w-4 shrink-0" />
              交易锁定中 - 请联系卖家
            </div>
          )}

          {/* 确认状态（交易中） */}
          {confirmStatusText && (
            <div className="mt-2 flex items-center gap-2">
              {myConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {confirmStatusText}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <Clock className="h-3.5 w-3.5" />
                  {confirmStatusText}
                </span>
              )}
            </div>
          )}

          {/* 操作按钮（按 subTab + status 显示） */}
          <div className="mt-3 flex flex-wrap gap-2">
            {subTab === "posted" && role === "seller" && (
              <>
                {isActive && (
                  <>
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(item.id)} disabled={loading} className={btnSecondary}>
                        <Pencil className="h-3.5 w-3.5" /> 编辑
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(item.id)} disabled={loading} className={btnDanger}>
                        <Trash2 className="h-3.5 w-3.5" /> 删除
                      </button>
                    )}
                    <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                      <Eye className="h-3.5 w-3.5" /> 查看意向
                    </button>
                  </>
                )}
                {isLocked && (
                  <>
                    {onUnlock && (
                      <button type="button" onClick={() => onUnlock(item.id)} disabled={loading} className={btnSecondary}>
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        重新上架
                      </button>
                    )}
                    {!myConfirmed && (
                      <button type="button" onClick={() => onConfirm(item.id)} disabled={loading} className={btnPrimary}>
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        确认交易完成
                      </button>
                    )}
                    <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                      <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                    </button>
                  </>
                )}
                {isCompleted && (
                  <>
                    {onRate && item.sellerRatingOfBuyer == null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">评价买家：</span>
                        <button
                          type="button"
                          onClick={() => onRate(item.id, true)}
                          disabled={ratingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          {ratingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                          好评
                        </button>
                        <button
                          type="button"
                          onClick={() => onRate(item.id, false)}
                          disabled={ratingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          差评
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                      <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                    </button>
                  </>
                )}
              </>
            )}
            {subTab === "interested" && role === "buyer" && isActive && (
              <>
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <Phone className="h-3.5 w-3.5" /> 联系卖家
                </button>
                {onWithdrawIntention && (
                  <button type="button" onClick={() => onWithdrawIntention(item.id)} disabled={loading} className={btnDanger}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    撤回意向
                  </button>
                )}
              </>
            )}
            {subTab === "locked" && role === "buyer" && isLocked && (
              <>
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <Phone className="h-3.5 w-3.5" /> 联系卖家
                </button>
                {!myConfirmed && (
                  <button type="button" onClick={() => onConfirm(item.id)} disabled={loading} className={btnPrimary}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    确认交易完成
                  </button>
                )}
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </button>
              </>
            )}
            {subTab === "acquired" && (
              <>
                {onRate && item.buyerRatingOfSeller == null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">评价卖家：</span>
                    <button
                      type="button"
                      onClick={() => onRate(item.id, true)}
                      disabled={ratingId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      {ratingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                      好评
                    </button>
                    <button
                      type="button"
                      onClick={() => onRate(item.id, false)}
                      disabled={ratingId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      差评
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </button>
              </>
            )}
            {subTab === "history" && (
              <>
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </button>
                {!isUnavailable && isActive && item.hasIntention !== false && (
                  <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                    <Phone className="h-3.5 w-3.5" /> 联系卖家
                  </button>
                )}
                {!isUnavailable && isActive && item.hasIntention === false && onReAddIntention && (
                  <button
                    type="button"
                    onClick={() => onReAddIntention(item.id)}
                    disabled={loading}
                    className={btnPrimary}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Heart className="h-3.5 w-3.5" />}
                    重新添加意向
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 状态徽章文案 */
function getStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "在售";
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

/** 集市交易商品项（我发布的 / 有意向的 / 曾有意向） */
interface MarketTransactionItem {
  id: string;
  title: string;
  price: number | null;
  images: string[];
  status: string;
  buyerId: string | null;
  selectedBuyerId?: string | null;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  lockedAt: string | null;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
  transactionType: { id: number; name: string; code: string };
  buyer?: { id: string; nickname: string | null };
  seller?: { id: string; nickname: string | null };
  /** 仅 history：当前用户是否仍有意向（false 时可 Re-add） */
  hasIntention?: boolean;
  /** 是否被下架（管理员或举报） */
  isHidden?: boolean;
  /** 买家对卖家的评价（true=好评，false=差评，null=未评价） */
  buyerRatingOfSeller?: boolean | null;
  /** 卖家对买家的评价 */
  sellerRatingOfBuyer?: boolean | null;
}

/**
 * 中控台页面
 * 功能：修改昵称、个人简介、换绑邮箱、修改密码
 */
type ProfileTab = "profileInfo" | "lostFound" | "marketTransactions" | "messages";

export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingSpinner className="flex min-h-[50vh] items-center justify-center" />}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const router = useRouter();
  const { currentUser, setUser } = useAuthStore();
  const { unreadCount, marketUnread, messagesUnread, fetchUnreadCounts } = useNotificationStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profileInfo");
  const isSmallScreen = !useMediaQuery("(min-width: 480px)");
  const isMdAndUp = useMediaQuery("(min-width: 768px)");

  const handleTabChange = useCallback(
    async (tab: ProfileTab) => {
      setActiveTab(tab);
      if (!currentUser?.id) return;
      // 集市交易 Tab：不自动清除红点，仅点击具体通知或「全部标为已读」时清除
      if (tab === "messages" && messagesUnread > 0) {
        const result = await markAsReadByEntityTypes(currentUser.id, ["COMMENT", "LOST_FOUND", "POI"]);
        if (result.success) await fetchUnreadCounts(currentUser.id);
      }
    },
    [currentUser?.id, messagesUnread, fetchUnreadCounts]
  );

  // 消息通知
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [marketNotifications, setMarketNotifications] = useState<NotificationItem[]>([]);
  const [marketNotificationsLoading, setMarketNotificationsLoading] = useState(false);
  const [marketSidebarExpanded, setMarketSidebarExpanded] = useState(false);

  // 集市交易（两角色：卖家/买家，前端二次筛选）
  const [marketSellingAll, setMarketSellingAll] = useState<MarketTransactionItem[]>([]);
  const [marketBuyingAll, setMarketBuyingAll] = useState<MarketTransactionItem[]>([]);
  const [marketSelling, setMarketSelling] = useState<MarketTransactionItem[]>([]);
  const [marketInterested, setMarketInterested] = useState<MarketTransactionItem[]>([]);
  const [marketLocked, setMarketLocked] = useState<MarketTransactionItem[]>([]);
  const [marketAcquired, setMarketAcquired] = useState<MarketTransactionItem[]>([]);
  const [marketHistory, setMarketHistory] = useState<MarketTransactionItem[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketRole, setMarketRole] = useState<MarketRole>("seller");
  const [marketStatusFilter, setMarketStatusFilter] = useState<MarketStatusFilter>("all");
  const [marketActionId, setMarketActionId] = useState<string | null>(null);
  const [marketRatingId, setMarketRatingId] = useState<string | null>(null);
  const [selectingBuyerId, setSelectingBuyerId] = useState<string | null>(null);
  const [marketDetailItem, setMarketDetailItem] = useState<MarketItemDetailData | null>(null);
  const [showMarketDetailModal, setShowMarketDetailModal] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [editingMarketItem, setEditingMarketItem] = useState<MarketItemDetailData | null>(null);
  const [marketCategoriesByType, setMarketCategoriesByType] = useState<MarketCategoriesByType>({});
  const [marketTransactionTypes, setMarketTransactionTypes] = useState<TransactionTypeItem[]>([]);
  const [marketThumbsUpRate, setMarketThumbsUpRate] = useState<number | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

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
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

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
              avatar: data.user.avatar || "",
            });
            setLastProfileUpdateAt(data.user.lastProfileUpdateAt || null);
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
        avatar: (currentUser as any).avatar || "",
      });
      setLastProfileUpdateAt((currentUser as any).lastProfileUpdateAt || null);
    } else {
      fetchUserInfo();
    }
  }, [currentUser, setUser]);

  const refreshMarketItems = useCallback(async () => {
    if (!currentUser?.id) return;
    setMarketLoading(true);
    try {
      const result = await getMyMarketItems();
      if (result.success && result.data) {
        const d = result.data;
        const uid = currentUser.id;
        const normalize = (items: typeof d.selling): MarketTransactionItem[] =>
          (items ?? []).map((x) => ({
            ...x,
            buyerId: x.buyerId ?? null,
            buyer: x.buyer ?? undefined,
            seller: x.seller ?? undefined,
          }));

        // 完整列表（用于两角色架构）
        setMarketSellingAll(normalize(d.selling));
        setMarketBuyingAll(normalize(d.buying));

        // 从 selling 派生：我发布的（ACTIVE/LOCKED/COMPLETED）
        const posted = d.selling.filter(
          (i) =>
            i.status === "ACTIVE" ||
            i.status === "LOCKED" ||
            i.status === "COMPLETED"
        );
        setMarketSelling(normalize(posted));

        // 从 buying 派生：有意向的（ACTIVE + hasIntention，且未锁定给我）
        const interested = d.buying.filter(
          (i) =>
            i.status === "ACTIVE" &&
            (i.hasIntention ?? true) &&
            i.selectedBuyerId !== uid
        );
        setMarketInterested(normalize(interested));

        // 从 buying 派生：交易中（LOCKED + selectedBuyerId 为我）
        const locked = d.buying.filter(
          (i) => i.status === "LOCKED" && i.selectedBuyerId === uid
        );
        setMarketLocked(normalize(locked));

        // 从 buying 派生：已得到（COMPLETED + selectedBuyerId 为我）
        const acquired = d.buying.filter(
          (i) => i.status === "COMPLETED" && i.selectedBuyerId === uid
        );
        setMarketAcquired(normalize(acquired));

        // 从 buying 派生：曾有意向（全部，含 EXPIRED/LOCKED/COMPLETED）
        setMarketHistory(normalize(d.buying));
      } else {
        toast.error(result.error || "获取集市交易失败");
      }
    } catch (e) {
      console.error("获取集市交易失败:", e);
      toast.error("获取失败，请重试");
    } finally {
      setMarketLoading(false);
    }
  }, [currentUser?.id]);

  const refreshMarketNotifications = useCallback(async () => {
    if (!currentUser?.id) return;
    const r = await getUserMarketNotifications(currentUser.id, 30);
    if (r.success && r.data) setMarketNotifications(r.data);
    await fetchUnreadCounts(currentUser.id);
  }, [currentUser?.id, fetchUnreadCounts]);

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

  // 切换到「集市交易」时拉取数据、分类及交易动态
  useEffect(() => {
    if (activeTab !== "marketTransactions" || !currentUser?.id) return;
    refreshMarketItems();
    setMarketNotificationsLoading(true);
    getUserMarketNotifications(currentUser.id, 30).then((r) => {
      setMarketNotificationsLoading(false);
      if (r.success && r.data) setMarketNotifications(r.data);
    });
    const fetchCategories = async () => {
      try {
        const result = await getMarketCategories();
        if (result.success && result.data) {
          setMarketCategoriesByType(result.data.data);
          setMarketTransactionTypes(result.data.transactionTypes);
        }
      } catch (e) {
        console.error("获取集市分类失败:", e);
      }
    };
    fetchCategories();
  }, [activeTab, currentUser?.id, refreshMarketItems]);

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

  // 切换到「消息」时拉取通知，并同步未读数到 store
  useEffect(() => {
    if (activeTab !== "messages" || !currentUser?.id) return;

    const fetchNotifications = async () => {
      setNotificationsLoading(true);
      const result = await getUserNotifications(currentUser.id, 50, ["MARKET_ITEM"]);
      setNotificationsLoading(false);
      if (result.success && result.data) {
        setNotifications(result.data);
        await fetchUnreadCounts(currentUser.id);
      } else {
        toast.error(result.error || "获取消息失败");
      }
    };

    fetchNotifications();
  }, [activeTab, currentUser?.id, fetchUnreadCounts]);

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
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            setUser(data.user);
            setLastProfileUpdateAt(data.user.lastProfileUpdateAt || null);
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

  // 标记通知已读（支持单条与分组点赞）
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

  // 交易动态侧边栏：点击通知 → 标已读 + 高亮卡片（如在视图中）+ 打开商品详情
  const handleMarketNotificationClick = async (n: NotificationItem) => {
    if (!n.entityId) return;
    if (n.message?.includes("选定您为买家")) setMarketRole("buyer");
    // Step 1: 标已读
    await handleMarkAsRead(n);
    setMarketNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );
    // Step 2: 高亮对应卡片（如在当前视图中）
    setHighlightedItemId(n.entityId);
    const clearHighlight = () => setHighlightedItemId(null);
    setTimeout(clearHighlight, 2000);
    // Step 3: 打开商品详情弹窗（短暂延迟以便用户看到高亮）
    await new Promise((r) => setTimeout(r, 120));
    await openMarketDetail(n.entityId);
  };

  // 通知行点击：MARKET_ITEM 跳转集市交易；COMMENT（回复/点赞）强制跳转地图并定位留言
  const handleNotificationClick = async (n: NotificationItem) => {
    if (n.entityType === "MARKET_ITEM" && n.entityId) {
      setActiveTab("marketTransactions");
      if (n.message?.includes("选定您为买家")) setMarketRole("buyer");
      await openMarketDetail(n.entityId);
    } else if (n.entityType === "COMMENT" && (n.type === "REPLY" || n.type === "LIKE")) {
      const poiId = n.poiId;
      const commentId = n.entityId || n.commentId;
      if (!poiId) {
        console.error("[Notification] Critical: poiId missing for REPLY/LIKE", {
          notificationId: n.id,
          type: n.type,
          entityId: n.entityId,
          entityType: n.entityType,
        });
        toast.error("无法定位到该留言，请稍后重试");
        await handleMarkAsRead(n);
        return;
      }
      if (!commentId) {
        console.error("[Notification] Critical: commentId/entityId missing", {
          notificationId: n.id,
          type: n.type,
        });
        await handleMarkAsRead(n);
        return;
      }
      router.push(
        `/?poiId=${poiId}&openDrawer=true&highlightCommentId=${commentId}`
      );
    }
    await handleMarkAsRead(n);
  };

  // 快捷回复（Server Action：创建留言、通知对方、标记原通知已读）
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
        if (currentUser?.id) {
          await fetchUnreadCounts(currentUser.id);
        }
      } else {
        toast.error(result.error || "发送失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // 全部标为已读（消息 Tab）
  const handleMarkAllAsRead = async () => {
    if (!currentUser?.id) return;
    const result = await markAllAsRead(currentUser.id);
    if (result.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await fetchUnreadCounts(currentUser.id);
      toast.success("已全部标为已读");
    } else {
      toast.error(result.error || "操作失败");
    }
  };

  // 交易动态全部标为已读
  const handleMarkAllMarketAsRead = async () => {
    if (!currentUser?.id) return;
    const result = await markAsReadByEntityTypes(currentUser.id, ["MARKET_ITEM"]);
    if (result.success) {
      setMarketNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await fetchUnreadCounts(currentUser.id);
      toast.success("交易动态已全部标为已读");
    } else {
      toast.error(result.error || "操作失败");
    }
  };

  // 集市交易：锁定商品
  const handleLockItem = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await lockMarketItem(itemId);
      if (result.success) {
        toast.success("已锁定商品");
        setMarketSelling((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, status: "LOCKED", lockedAt: new Date().toISOString() } : i
          )
        );
        setMarketDetailItem((prev) =>
          prev?.id === itemId ? { ...prev, status: "LOCKED", lockedAt: new Date().toISOString() } : prev
        );
      } else {
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setMarketActionId(null);
    }
  };

  // 集市交易：重新上架
  const handleUnlockItem = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await unlockMarketItem(itemId);
      if (result.success) {
        toast.success("已重新上架");
        setShowMarketDetailModal(false);
        setMarketDetailItem(null);
        await refreshMarketItems();
        await refreshMarketNotifications();
      } else {
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setMarketActionId(null);
    }
  };

  // 集市交易：评价（好评/差评）
  const handleRateTransaction = async (itemId: string, isPositive: boolean) => {
    setMarketRatingId(itemId);
    try {
      const result = await rateMarketTransaction(itemId, isPositive);
      if (result.success) {
        toast.success(isPositive ? "感谢您的评价！" : "已记录您的反馈");
        await refreshMarketItems();
        if (currentUser?.id) {
          getMarketThumbsUpRate(currentUser.id).then((r) => {
            if (r.success && r.data && r.data.total > 0) setMarketThumbsUpRate(r.data.rate);
          });
        }
        setMarketDetailItem((prev) => {
          if (prev?.id !== itemId) return prev;
          const isSeller = prev.user?.id === currentUser?.id;
          return isSeller
            ? { ...prev, sellerRatingOfBuyer: isPositive }
            : { ...prev, buyerRatingOfSeller: isPositive };
        });
      } else {
        toast.error(result.error ?? "评价失败");
      }
    } catch {
      toast.error("评价失败，请重试");
    } finally {
      setMarketRatingId(null);
    }
  };

  // 集市交易：选定买家并锁定
  const handleSelectBuyerAndLock = async (itemId: string, buyerId: string) => {
    setSelectingBuyerId(buyerId);
    try {
      const result = await selectBuyerAndLock(itemId, buyerId);
      if (result.success) {
        toast.success("商品已锁定，等待双方确认交易");
        const detailResult = await getMarketItemDetail(itemId);
        if (detailResult.success && detailResult.data) {
          setMarketDetailItem(detailResult.data as MarketItemDetailData);
        }
        await refreshMarketItems();
        await refreshMarketNotifications();
        return { success: true };
      }
      toast.error(result.error ?? "操作失败");
      return { success: false, error: result.error };
    } catch {
      toast.error("操作失败，请重试");
      return { success: false, error: "操作失败" };
    } finally {
      setSelectingBuyerId(null);
    }
  };

  // 集市交易：确认交易完成
  const handleConfirmTransaction = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await confirmTransaction(itemId);
      if (result.success) {
        const completed = (result as { data?: { completed?: boolean } }).data?.completed;
        toast.success(completed ? "交易已完成！" : "已确认，等待对方确认");
        await refreshMarketItems();
        await refreshMarketNotifications();
        if (completed) {
          setMarketRole("buyer");
          setMarketStatusFilter("ended");
        }
        setMarketDetailItem((prev) => {
          if (prev?.id !== itemId) return prev;
          const isSeller = prev.user?.id === currentUser?.id;
          const nextSellerConfirmed = isSeller ? true : prev.sellerConfirmed;
          const nextBuyerConfirmed = !isSeller ? true : prev.buyerConfirmed;
          const nextStatus = nextSellerConfirmed && nextBuyerConfirmed ? "COMPLETED" : prev.status;
          return { ...prev, sellerConfirmed: nextSellerConfirmed, buyerConfirmed: nextBuyerConfirmed, status: nextStatus };
        });
      } else {
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setMarketActionId(null);
    }
  };

  // 集市交易：删除商品
  const handleDeleteMarketItem = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await deleteMarketItem(itemId);
      if (result.success) {
        toast.success("已删除");
        setShowMarketDetailModal(false);
        setMarketDetailItem(null);
        await refreshMarketItems();
      } else {
        toast.error(result.error ?? "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setMarketActionId(null);
    }
  };

  // 集市交易：撤回意向
  const handleWithdrawIntention = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await withdrawIntention(itemId);
      if (result.success) {
        toast.success("已撤回意向");
        await refreshMarketItems();
      } else {
        toast.error(result.error ?? "撤回失败");
      }
    } catch {
      toast.error("撤回失败，请重试");
    } finally {
      setMarketActionId(null);
    }
  };

  // 集市交易：重新添加意向（History 中曾撤回的 ACTIVE 商品）
  const handleReAddIntention = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await submitIntention(itemId);
      if (result.success) {
        toast.success("已重新添加意向");
        await refreshMarketItems();
        setMarketRole("buyer");
        setMarketStatusFilter("ongoing");
      } else {
        toast.error(result.error ?? "添加意向失败");
      }
    } catch {
      toast.error("添加意向失败，请重试");
    } finally {
      setMarketActionId(null);
    }
  };

  // 集市交易：打开编辑弹窗（需先拉取完整商品数据）
  const handleEditMarketItem = async (itemId: string) => {
    try {
      const result = await getMarketItemDetail(itemId);
      if (result.success && result.data) {
        setEditingMarketItem(result.data as MarketItemDetailData);
      } else {
        toast.error(result.error ?? "商品不存在或已下架");
      }
    } catch (e) {
      toast.error("加载失败");
    }
  };

  // 集市交易：打开详情弹窗
  const openMarketDetail = useCallback(async (itemId: string) => {
    try {
      const result = await getMarketItemDetail(itemId);
      if (result.success && result.data) {
        const d = result.data as MarketItemDetailData;
        if (d.masked) {
          toast.error("该商品已被屏蔽");
          return;
        }
        setMarketDetailItem(d);
        setShowMarketDetailModal(true);
      } else {
        toast.error(result.error ?? "商品不存在或已下架");
      }
    } catch (e) {
      toast.error("加载失败");
    }
  }, []);

  // 深度链接：从通知点击「查看商品」时，通过 URL 打开指定商品
  const searchParams = useSearchParams();
  useEffect(() => {
    const openItemId = searchParams.get("openItemId");
    const tab = searchParams.get("tab");
    const view = searchParams.get("view");
    if (openItemId && tab === "marketTransactions") {
      setActiveTab("marketTransactions");
      if (view === "buying") setMarketRole("buyer");
      openMarketDetail(openItemId);
      router.replace("/profile", { scroll: false });
    }
  }, [searchParams, openMarketDetail, router]);

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
          <p className="mt-1 text-sm text-[#7C7C7C]">管理个人资料、交易与校园消息</p>
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
            <button
              onClick={() => handleTabChange("marketTransactions")}
              className={`relative flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === "marketTransactions"
                  ? "border-[#FF4500] text-[#FF4500]"
                  : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
              }`}
            >
              <ShoppingBag className="h-4 w-4" />
              集市交易
              {marketUnread > 0 && (
                <span
                  className="ml-0.5 h-2 w-2 shrink-0 rounded-full border-2 border-white bg-[#FF4500]"
                  aria-label={`${marketUnread} 条集市未读`}
                />
              )}
            </button>
            <button
              onClick={() => handleTabChange("messages")}
              className={`relative flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === "messages"
                  ? "border-[#FF4500] text-[#FF4500]"
                  : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              消息
              {messagesUnread > 0 && (
                <span
                  className="ml-0.5 h-2 w-2 shrink-0 rounded-full border-2 border-white bg-[#FF4500]"
                  aria-label={`${messagesUnread} 条消息未读`}
                />
              )}
            </button>
          </div>
        </div>

        {/* Tab 内容区：Desktop 固定布局；Mobile 自然流式滚动 */}
        <div
          className={`min-h-0 flex-1 ${
            activeTab === "marketTransactions"
              ? isMdAndUp
                ? "overflow-hidden"
                : "overflow-visible"
              : "overflow-y-auto scrollbar-gutter-stable"
          }`}
        >
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

        {/* 集市交易 Tab：Desktop 固定双列；Mobile 自然流式 + 底部 Accordion 侧边栏 */}
        {activeTab === "marketTransactions" && (
          <div
            className={`mx-auto flex w-full max-w-6xl flex-col px-4 py-4 md:flex-row md:gap-6 ${
              isMdAndUp ? "h-full flex-1 overflow-hidden" : "min-h-0 flex-1"
            }`}
          >
            {/* 左列：商品列表（Desktop 独立滚动；Mobile 自然流） */}
            <div
              className={`flex flex-col md:pr-4 ${
                isMdAndUp ? "min-h-0 flex-1 overflow-hidden" : "flex-1"
              }`}
            >
            {/* 内容区：Desktop 独立滚动；Mobile 自然流，sticky 筛选栏仍生效 */}
            <div
              className={`overflow-x-hidden pr-4 ${
                isMdAndUp
                  ? "min-h-0 flex-1 overflow-y-auto scroll-momentum"
                  : "overflow-visible"
              }`}
            >
            {/* Sticky 筛选栏：角色切换 + 状态筛选，z-20 高于卡片、低于 Modal */}
            <div className="sticky top-0 z-20 -mx-1 bg-white/80 px-1 pb-4 pt-1 backdrop-blur-md md:mx-0 md:px-0">
              {/* Level 1: 角色切换（我是卖家 / 我是买家） */}
              <div
                className={`flex rounded-xl bg-[#EDEFF1] p-1 ${
                  isSmallScreen ? "py-1" : "p-1"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMarketRole("seller");
                    setMarketStatusFilter("all");
                  }}
                  className={`flex-1 rounded-lg text-sm font-medium transition-colors ${
                    isSmallScreen ? "px-3 py-2" : "px-4 py-2.5"
                  } ${
                    marketRole === "seller"
                      ? "bg-white text-[#1A1A1B] shadow-sm"
                      : "text-[#7C7C7C] hover:text-[#1A1A1B]"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5 md:gap-2">
                    <Package className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    {isSmallScreen ? "卖家" : "我是卖家"}
                    <span className="rounded-full bg-[#EDEFF1] px-1.5 py-0.5 text-xs md:px-2">
                      {marketSellingAll.length}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarketRole("buyer");
                    setMarketStatusFilter("all");
                  }}
                  className={`flex-1 rounded-lg text-sm font-medium transition-colors ${
                    isSmallScreen ? "px-3 py-2" : "px-4 py-2.5"
                  } ${
                    marketRole === "buyer"
                      ? "bg-white text-[#1A1A1B] shadow-sm"
                      : "text-[#7C7C7C] hover:text-[#1A1A1B]"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5 md:gap-2">
                    <Heart className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    {isSmallScreen ? "买家" : "我是买家"}
                    <span className="rounded-full bg-[#EDEFF1] px-1.5 py-0.5 text-xs md:px-2">
                      {marketBuyingAll.length}
                    </span>
                  </span>
                </button>
              </div>

              {/* Level 2: 状态筛选（全部 / 进行中 / 已结束） */}
              <div className="mt-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                <div className="flex gap-2 min-w-max md:min-w-0 md:flex-wrap">
                {(marketRole === "seller" ? SELLING_STATUS_FILTERS : BUYING_STATUS_FILTERS).map(
                  ({ id, label }) => {
                    const count =
                      marketRole === "seller"
                        ? id === "all"
                          ? marketSellingAll.length
                          : id === "ongoing"
                            ? marketSellingAll.filter(
                                (i) => i.status === "ACTIVE" || i.status === "LOCKED"
                              ).length
                            : marketSellingAll.filter(
                                (i) =>
                                  i.status === "COMPLETED" ||
                                  i.status === "EXPIRED" ||
                                  i.status === "DELETED" ||
                                  i.isHidden === true
                              ).length
                        : id === "all"
                          ? marketBuyingAll.length
                          : id === "ongoing"
                            ? marketBuyingAll.filter(
                                (i) =>
                                  (i.status === "ACTIVE" && (i.hasIntention ?? true)) ||
                                  (i.status === "LOCKED" && i.selectedBuyerId === currentUser?.id)
                              ).length
                            : marketBuyingAll.filter(
                                (i) =>
                                  i.status === "COMPLETED" ||
                                  i.status === "EXPIRED" ||
                                  i.status === "DELETED" ||
                                  i.isHidden === true
                              ).length;
                    const isActive = marketStatusFilter === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMarketStatusFilter(id)}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-[#FF4500] text-white"
                            : "bg-[#EDEFF1] text-[#1A1A1B] hover:bg-[#E4E6E8]"
                        }`}
                      >
                        {label}
                        <span className="ml-1.5 opacity-80">({count})</span>
                      </button>
                    );
                  }
                )}
                </div>
              </div>
            </div>

            {/* 商品列表：pt-4 避免首卡被 sticky 遮挡 */}
            <div className="rounded-lg border border-[#EDEFF1] bg-white p-6 pt-4">
              {marketLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#7C7C7C]" />
                </div>
              ) : (() => {
                const uid = currentUser?.id ?? "";
                const sellingFiltered =
                  marketRole === "seller"
                    ? marketStatusFilter === "all"
                      ? marketSellingAll
                      : marketStatusFilter === "ongoing"
                        ? marketSellingAll.filter(
                            (i) => i.status === "ACTIVE" || i.status === "LOCKED"
                          )
                        : marketSellingAll.filter(
                            (i) =>
                              i.status === "COMPLETED" ||
                              i.status === "EXPIRED" ||
                              i.status === "DELETED" ||
                              i.isHidden === true
                          )
                    : [];
                const buyingFiltered =
                  marketRole === "buyer"
                    ? marketStatusFilter === "all"
                      ? marketBuyingAll
                      : marketStatusFilter === "ongoing"
                        ? marketBuyingAll.filter(
                            (i) =>
                              (i.status === "ACTIVE" && (i.hasIntention ?? true)) ||
                              (i.status === "LOCKED" && i.selectedBuyerId === uid)
                          )
                        : marketBuyingAll.filter(
                            (i) =>
                              i.status === "COMPLETED" ||
                              i.status === "EXPIRED" ||
                              i.status === "DELETED" ||
                              i.isHidden === true
                          )
                    : [];
                const items = marketRole === "seller" ? sellingFiltered : buyingFiltered;

                if (marketRole === "seller" && items.length === 0) {
                  return (
                    <EmptyState
                      icon={Package}
                      title="您还没有发布过任何物品"
                      description="去集市发布您的闲置物品，与校园同学分享"
                      action={{
                        label: "去集市发布",
                        onClick: () => router.push("/?market=true"),
                      }}
                    />
                  );
                }
                if (marketRole === "buyer" && items.length === 0) {
                  return (
                    <EmptyState
                      icon={Heart}
                      title="您还没有参与过任何交易"
                      description="去集市逛逛，发现感兴趣的商品并表达意向"
                      action={{
                        label: "去集市逛逛",
                        onClick: () => router.push("/?market=true"),
                      }}
                    />
                  );
                }
                return (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {items.map((item) =>
                      marketRole === "seller" ? (
                        <MarketTransactionCard
                          key={item.id}
                          item={item}
                          role="seller"
                          subTab="posted"
                          currentUserId={uid}
                          onUnlock={handleUnlockItem}
                          onConfirm={handleConfirmTransaction}
                          onRate={handleRateTransaction}
                          onViewDetails={openMarketDetail}
                          onEdit={handleEditMarketItem}
                          onDelete={handleDeleteMarketItem}
                          actionId={marketActionId}
                          ratingId={marketRatingId}
                          formatTime={formatRelativeTime}
                          isHighlighted={item.id === highlightedItemId}
                        />
                      ) : (
                        <MarketTransactionCard
                          key={item.id}
                          item={item}
                          role="buyer"
                          subTab={getBuyerSubTab(item, uid)}
                          currentUserId={uid}
                          onConfirm={handleConfirmTransaction}
                          onRate={handleRateTransaction}
                          onViewDetails={openMarketDetail}
                          onWithdrawIntention={
                            getBuyerSubTab(item, uid) === "interested"
                              ? handleWithdrawIntention
                              : undefined
                          }
                          onReAddIntention={
                            getBuyerSubTab(item, uid) === "history"
                              ? handleReAddIntention
                              : undefined
                          }
                          actionId={marketActionId}
                          ratingId={marketRatingId}
                          formatTime={formatRelativeTime}
                          isHighlighted={item.id === highlightedItemId}
                        />
                      )
                    )}
                  </div>
                );
              })()}
            </div>
            </div>

            {/* 移动端：可折叠的交易动态 Accordion（桌面端为右侧独立滚动侧边栏） */}
            <div className="mt-4 pb-6 md:hidden">
              <button
                type="button"
                onClick={() => setMarketSidebarExpanded(!marketSidebarExpanded)}
                className="flex w-full items-center justify-between rounded-lg border border-[#EDEFF1] bg-white px-4 py-3 text-left text-sm font-medium text-[#1A1A1B]"
              >
                <span className="flex items-center gap-2">
                  交易动态
                  {marketUnread > 0 && (
                    <span className="h-2 w-2 rounded-full bg-[#FF4500]" aria-hidden />
                  )}
                </span>
                {marketSidebarExpanded ? (
                  <ChevronUp className="h-4 w-4 text-[#7C7C7C]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#7C7C7C]" />
                )}
              </button>
              {marketSidebarExpanded && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#EDEFF1] bg-white p-3 no-scrollbar">
                  {marketNotifications.some((n) => !n.isRead) && (
                    <button
                      type="button"
                      onClick={handleMarkAllMarketAsRead}
                      className="mb-2 w-full text-right text-xs font-medium text-[#FF4500] hover:underline"
                    >
                      全部标为已读
                    </button>
                  )}
                  {marketNotificationsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin text-[#7C7C7C]" />
                    </div>
                  ) : marketNotifications.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[#7C7C7C]">暂无交易动态</p>
                  ) : (
                    <div className="space-y-2">
                      {marketNotifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleMarketNotificationClick(n)}
                          className={`relative flex w-full flex-col gap-1 rounded-lg p-3 text-left transition-colors hover:bg-[#F7F7F8] ${
                            !n.isRead ? "bg-[#FFE5DD]/30" : ""
                          }`}
                        >
                          {!n.isRead && (
                            <span
                              className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#FF4500]"
                              aria-label="未读"
                            />
                          )}
                          <p className="text-sm text-[#1A1A1B] pr-5">{n.message ?? "交易动态"}</p>
                          <p className="text-xs text-[#7C7C7C]">{formatRelativeTimeShort(n.createdAt)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
              </div>

              {/* 右列：交易动态侧边栏（桌面端），独立滚动 + no-scrollbar */}
              <aside className="hidden w-80 shrink-0 flex-col overflow-hidden border-l border-[#EDEFF1] bg-white md:flex">
                <div className="flex flex-shrink-0 items-center justify-between border-b border-[#EDEFF1] px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1A1A1B]">交易动态</h3>
                    {marketUnread > 0 && (
                      <p className="mt-0.5 text-xs text-[#7C7C7C]">{marketUnread} 条未读</p>
                    )}
                  </div>
                  {marketNotifications.some((n) => !n.isRead) && (
                    <button
                      type="button"
                      onClick={handleMarkAllMarketAsRead}
                      className="text-xs font-medium text-[#FF4500] hover:underline"
                    >
                      全部标为已读
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2 no-scrollbar">
                    {marketNotificationsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-[#7C7C7C]" />
                      </div>
                    ) : marketNotifications.length === 0 ? (
                      <p className="py-8 text-center text-sm text-[#7C7C7C]">暂无交易动态</p>
                    ) : (
                      <div className="space-y-2">
                        {marketNotifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleMarketNotificationClick(n)}
                            className={`relative flex w-full flex-col gap-1 rounded-lg p-3 text-left transition-colors hover:bg-[#F7F7F8] ${
                              !n.isRead ? "bg-[#FFE5DD]/30" : ""
                            }`}
                          >
                            {!n.isRead && (
                              <span
                                className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#FF4500]"
                                aria-label="未读"
                              />
                            )}
                            <p className="pr-5 text-sm text-[#1A1A1B]">{n.message ?? "交易动态"}</p>
                            <p className="text-xs text-[#7C7C7C]">{formatRelativeTimeShort(n.createdAt)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </aside>
          </div>
        )}

        {/* 消息 Tab */}
        {activeTab === "messages" && (
          <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
          <div className="rounded-lg border border-[#EDEFF1] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1A1A1B]">消息</h2>
              {notifications.some((n) => !n.isRead) && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm font-medium text-[#FF4500] hover:underline"
                >
                  全部标为已读
                </button>
              )}
            </div>

            {notificationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#7C7C7C]" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-12 text-center text-sm text-[#7C7C7C]">
                暂无消息
              </p>
            ) : (
              <div className="space-y-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-lg transition-all ${
                      !n.isRead ? "bg-[#FFE5DD]/30" : ""
                    } ${
                      n.entityType === "COMMENT" && (n.type === "REPLY" || n.type === "LIKE")
                        ? "cursor-pointer hover:bg-gray-50 active:scale-[0.98]"
                        : "hover:bg-[#F7F7F8]"
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(n)}
                      onKeyDown={(e) => e.key === "Enter" && handleNotificationClick(n)}
                      className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-all"
                    >
                      {/* 头像（REPLY 显示回复者，LIKE 显示最新点赞者） */}
                      <div className="relative mt-0.5 shrink-0">
                        {n.actor?.avatar ? (
                          <Image
                            src={n.actor.avatar}
                            alt=""
                            width={36}
                            height={36}
                            className="h-9 w-9 rounded-full object-cover"
                            unoptimized={n.actor.avatar.startsWith("blob:")}
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EDEFF1]">
                            <User className="h-4 w-4 text-[#7C7C7C]" />
                          </div>
                        )}
                        {!n.isRead && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#FF4500]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* 主文案 */}
                        <p
                          className={`text-sm ${
                            !n.isRead ? "font-semibold text-[#1A1A1B]" : "text-[#1A1A1B]"
                          }`}
                        >
                          {getNotificationDisplayText(n, isSmallScreen)}
                        </p>

                        {/* REPLY：回复内容直接显示在 actor 下方 */}
                        {n.type === "REPLY" && n.replyContent && (
                          <p className="mt-1.5 line-clamp-3 text-sm text-[#1A1A1B]">
                            {truncateText(n.replyContent, 120)}
                          </p>
                        )}

                        {/* 共享：原始留言内容引用块（COMMENT 类型：LIKE / REPLY），点击跳转地图并滚动到该留言 */}
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
                            className="mt-2 block w-full cursor-pointer rounded-md bg-[#EDEFF1]/50 p-2 text-left text-xs italic text-[#7C7C7C] transition-colors hover:bg-[#E3E5E7]/70 hover:text-[#1A1A1B]"
                          >
                            {n.originalCommentContent
                              ? truncateText(n.originalCommentContent, 80)
                              : "点击查看回复"}
                          </button>
                        )}

                        {/* 其他类型的 message */}
                        {n.message &&
                          n.type !== "REPLY" &&
                          n.type !== "LIKE" && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[#7C7C7C]">
                            {n.message}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-[#7C7C7C]">
                            {formatRelativeTimeShort(n.createdAt)}
                          </p>
                          {n.entityType === "MARKET_ITEM" && n.entityId && (
                            <Link
                              href={`/profile?tab=marketTransactions&openItemId=${n.entityId}${n.message?.includes("选定您为买家") ? "&view=buying" : ""}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#FF4500] hover:underline"
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                              查看商品
                            </Link>
                          )}
                          {/* 快捷回复：仅 REPLY 显示 */}
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

                    {/* 快捷回复输入区（紧凑布局） */}
                    {replyingToId === n.id && n.poiId && n.commentId && (
                      <div
                        className="border-t border-[#EDEFF1] px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="输入回复内容..."
                          maxLength={500}
                          rows={2}
                          className="mb-1.5 w-full resize-none rounded-lg border border-[#EDEFF1] px-2.5 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[#7C7C7C]">
                            {replyContent.length}/500
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickReply(n.poiId!, n.commentId!, n.id)}
                            disabled={isSubmittingReply || !replyContent.trim()}
                            className="flex shrink-0 items-center gap-1 rounded-lg bg-[#FF4500] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmittingReply ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            发送
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        )}
        </div>
      </div>

      {/* 集市交易商品详情弹窗 */}
      <MarketItemDetailModal
        isOpen={showMarketDetailModal}
        onClose={() => {
          setShowMarketDetailModal(false);
          setMarketDetailItem(null);
        }}
        item={marketDetailItem}
        currentUser={currentUser}
        variant="profile"
        onLock={handleLockItem}
        onUnlock={handleUnlockItem}
        onSelectBuyerAndLock={handleSelectBuyerAndLock}
        onConfirm={handleConfirmTransaction}
        onRate={handleRateTransaction}
        onDelete={handleDeleteMarketItem}
        onEdit={() => {
          if (marketDetailItem) {
            setShowMarketDetailModal(false);
            setMarketDetailItem(null);
            setEditingMarketItem(marketDetailItem);
          }
        }}
        actionId={marketActionId}
        ratingId={marketRatingId}
        selectingBuyerId={selectingBuyerId}
        onViewOnMap={() => {
          if (marketDetailItem?.poiId) {
            setShowMarketDetailModal(false);
            setMarketDetailItem(null);
            router.push(`/?poiId=${marketDetailItem.poiId}`);
          }
        }}
        onViewUserProfile={setProfileModalUserId}
      />

      <UserProfileModal
        userId={profileModalUserId}
        isOpen={!!profileModalUserId}
        onClose={() => setProfileModalUserId(null)}
      />

      {/* 集市交易编辑弹窗 */}
      <PostItemModal
        isOpen={!!editingMarketItem}
        onClose={() => setEditingMarketItem(null)}
        onSuccess={refreshMarketItems}
        schoolId={currentUser?.schoolId ?? ""}
        categoriesByType={marketCategoriesByType}
        transactionTypes={marketTransactionTypes}
        initialData={editingMarketItem ?? undefined}
      />
    </AuthGuard>
  );
}
