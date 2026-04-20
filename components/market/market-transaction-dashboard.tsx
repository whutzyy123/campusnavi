"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  getUserMarketNotifications,
  markAsRead,
  markAsReadMultiple,
  markAsReadByEntityTypes,
  type NotificationItem,
} from "@/lib/notification-actions";
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
  getMarketCategories,
} from "@/lib/market-actions";
import { useNotificationStore } from "@/store/use-notification-store";
import toast from "react-hot-toast";
import {
  Package,
  MapPin,
  ExternalLink,
  Loader2,
  ShoppingBag,
  LockKeyhole,
  RotateCcw,
  CheckCircle,
  Pencil,
  Heart,
  Trash2,
  Eye,
  Phone,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { MarketItemDetailModal, type MarketItemDetailData } from "@/components/market/market-item-detail-modal";
import { PostItemModal, type MarketCategoriesByType, type TransactionTypeItem } from "@/components/market/post-item-modal";
import { UserProfileModal } from "@/components/shared/user-profile-modal";
import { EmptyState } from "@/components/empty-state";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatRelativeTime } from "@/lib/utils";
import {
  getBuyerSubTab,
  SELLING_STATUS_FILTERS,
  BUYING_STATUS_FILTERS,
  type MarketSubTab,
  type MarketRole,
  type MarketStatusFilter,
  type MarketTransactionItem,
} from "./market-transaction-types";
import { useMarketTransactionDashboardState } from "./use-market-transaction-dashboard-state";

export type { MarketSubTab, MarketRole, MarketStatusFilter, MarketTransactionItem } from "./market-transaction-types";
export { getBuyerSubTab, SELLING_STATUS_FILTERS, BUYING_STATUS_FILTERS } from "./market-transaction-types";

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

  const isUnavailable =
    role === "buyer" &&
    ((isCompleted && item.selectedBuyerId !== currentUserId) ||
      isExpired ||
      item.status === "DELETED" ||
      item.isHidden === true ||
      (isLocked && item.selectedBuyerId !== currentUserId));

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

          {isLockedForMe && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <LockKeyhole className="h-4 w-4 shrink-0" />
              交易锁定中 - 请联系卖家
            </div>
          )}

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

export interface MarketTransactionDashboardProps {
  currentUser: { id: string; schoolId?: string | null } | null;
  schoolId?: string | null;
  initialOpenItemId?: string | null;
  initialView?: "buying" | "selling" | null;
}

export function MarketTransactionDashboard({
  currentUser,
  schoolId: schoolIdProp,
  initialOpenItemId,
  initialView,
}: MarketTransactionDashboardProps) {
  const router = useRouter();
  const { marketUnread, fetchUnreadCounts } = useNotificationStore();
  const schoolId = schoolIdProp ?? currentUser?.schoolId ?? "";
  const isSmallScreen = !useMediaQuery("(min-width: 480px)");
  const isMdAndUp = useMediaQuery("(min-width: 768px)");

  const {
    marketSellingAll,
    setMarketSellingAll,
    marketBuyingAll,
    setMarketBuyingAll,
    marketLoading,
    marketRole,
    setMarketRole,
    marketStatusFilter,
    setMarketStatusFilter,
    refreshMarketItems,
  } = useMarketTransactionDashboardState(currentUser?.id, initialView);

  const [marketActionId, setMarketActionId] = useState<string | null>(null);
  const [marketRatingId, setMarketRatingId] = useState<string | null>(null);
  const [selectingBuyerId, setSelectingBuyerId] = useState<string | null>(null);
  const [marketDetailItem, setMarketDetailItem] = useState<MarketItemDetailData | null>(null);
  const [showMarketDetailModal, setShowMarketDetailModal] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [editingMarketItem, setEditingMarketItem] = useState<MarketItemDetailData | null>(null);
  const [marketCategoriesByType, setMarketCategoriesByType] = useState<MarketCategoriesByType>({});
  const [marketTransactionTypes, setMarketTransactionTypes] = useState<TransactionTypeItem[]>([]);
  const [marketNotifications, setMarketNotifications] = useState<NotificationItem[]>([]);
  const [marketNotificationsLoading, setMarketNotificationsLoading] = useState(false);
  const [marketSidebarExpanded, setMarketSidebarExpanded] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  const refreshMarketNotifications = useCallback(async () => {
    if (!currentUser?.id) return;
    const r = await getUserMarketNotifications(currentUser.id, 30);
    if (r.success && r.data) setMarketNotifications(r.data);
    await fetchUnreadCounts(currentUser.id);
  }, [currentUser?.id, fetchUnreadCounts]);

  const handleMarkAsRead = async (n: NotificationItem) => {
    const result = n.notificationIds?.length
      ? await markAsReadMultiple(n.notificationIds)
      : await markAsRead(n.id);
    if (result.success && currentUser?.id) {
      const idsToMark = n.notificationIds ?? [n.id];
      setMarketNotifications((prev) =>
        prev.map((item) =>
          idsToMark.includes(item.id) || item.id === n.id
            ? { ...item, isRead: true }
            : item
        )
      );
      await fetchUnreadCounts(currentUser.id);
    }
  };

  const handleMarketNotificationClick = async (n: NotificationItem) => {
    if (!n.entityId) return;
    if (n.message?.includes("选定您为买家")) setMarketRole("buyer");
    await handleMarkAsRead(n);
    setMarketNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
    );
    setHighlightedItemId(n.entityId);
    setTimeout(() => setHighlightedItemId(null), 2000);
    await new Promise((r) => setTimeout(r, 120));
    await openMarketDetail(n.entityId);
  };

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

  const handleLockItem = async (itemId: string) => {
    setMarketActionId(itemId);
    try {
      const result = await lockMarketItem(itemId);
      if (result.success) {
        toast.success("已锁定商品");
        setMarketSellingAll((prev) =>
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

  const handleRateTransaction = async (itemId: string, isPositive: boolean) => {
    setMarketRatingId(itemId);
    try {
      const result = await rateMarketTransaction(itemId, isPositive);
      if (result.success) {
        toast.success(isPositive ? "感谢您的评价！" : "已记录您的反馈");
        await refreshMarketItems();
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

  useEffect(() => {
    if (!currentUser?.id) return;
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
  }, [currentUser?.id]);

  useEffect(() => {
    if (initialOpenItemId && currentUser?.id) {
      if (initialView === "buying") setMarketRole("buyer");
      openMarketDetail(initialOpenItemId);
    }
  }, [initialOpenItemId, initialView, currentUser?.id, openMarketDetail, setMarketRole]);

  if (!currentUser?.id) {
    return null;
  }

  const uid = currentUser.id;
  const sellingFiltered =
    marketRole === "seller"
      ? marketStatusFilter === "all"
        ? marketSellingAll
        : marketStatusFilter === "ongoing"
          ? marketSellingAll.filter((i) => i.status === "ACTIVE" || i.status === "LOCKED")
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

  return (
    <div
      className={`mx-auto flex w-full max-w-6xl flex-col px-4 py-4 md:flex-row md:gap-6 ${
        isMdAndUp ? "h-full flex-1 overflow-hidden" : "min-h-0 flex-1"
      }`}
    >
      <div
        className={`flex flex-col md:pr-4 ${
          isMdAndUp ? "min-h-0 flex-1 overflow-hidden" : "flex-1"
        }`}
      >
        <div
          className={`overflow-x-hidden pr-4 ${
            isMdAndUp
              ? "min-h-0 flex-1 overflow-y-auto scroll-momentum"
              : "overflow-visible"
          }`}
        >
          <div className="sticky top-0 z-20 -mx-1 bg-white/80 px-1 pb-4 pt-1 backdrop-blur-md md:mx-0 md:px-0">
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
                                  (i.status === "LOCKED" && i.selectedBuyerId === uid)
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

          <div className="rounded-lg border border-[#EDEFF1] bg-white p-6 pt-4">
            {marketLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#7C7C7C]" />
              </div>
            ) : marketRole === "seller" && items.length === 0 ? (
              <EmptyState
                icon={Package}
                title="您还没有发布过任何物品"
                description="去集市发布您的闲置物品，与校园同学分享"
                action={{
                  label: "去集市发布",
                  onClick: () => router.push("/?market=true"),
                }}
              />
            ) : marketRole === "buyer" && items.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="您还没有参与过任何交易"
                description="去集市逛逛，发现感兴趣的商品并表达意向"
                action={{
                  label: "去集市逛逛",
                  onClick: () => router.push("/?market=true"),
                }}
              />
            ) : (
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
            )}
          </div>
        </div>

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
                      <p className="text-xs text-[#7C7C7C]">{formatRelativeTime(n.createdAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
                  <p className="text-xs text-[#7C7C7C]">{formatRelativeTime(n.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

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

      <PostItemModal
        isOpen={!!editingMarketItem}
        onClose={() => setEditingMarketItem(null)}
        onSuccess={refreshMarketItems}
        schoolId={schoolId}
        categoriesByType={marketCategoriesByType}
        transactionTypes={marketTransactionTypes}
        initialData={editingMarketItem ?? undefined}
      />
    </div>
  );
}
