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
} from "@/lib/actions/notification";
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
} from "@/lib/actions/market";
import { useNotificationStore } from "@/store/use-notification-store";
import toast from "react-hot-toast";
import {
  Package,
  Loader2,
  ChevronDown,
  ChevronUp,
  Heart,
} from "lucide-react";
import { MarketItemDetailModal, type MarketItemDetailData } from "@/components/market/market-item-detail-modal";
import { PostItemModal, type MarketCategoriesByType, type TransactionTypeItem } from "@/components/market/post-item-modal";
import { UserProfileModal } from "@/components/shared/user-profile-modal";
import { EmptyState } from "@/components/empty-state";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatRelativeTime } from "@/lib/core/utils";
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

import { MarketTransactionCard } from "./market-transaction-card";
import { MarketStatusFilter as MarketStatusFilterBar } from "./market-status-filter";
import { MarketNotificationDropdown, MarketNotificationList } from "./market-notification-list";

export interface MarketTransactionDashboardProps {
  currentUser: { id: string; schoolId?: string | null } | null;
  schoolId?: string | null;
  schoolName?: string | null;
  initialOpenItemId?: string | null;
  initialView?: "buying" | "selling" | null;
}

export function MarketTransactionDashboard({
  currentUser,
  schoolId: schoolIdProp,
  schoolName,
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
        if (d.status === "HIDDEN") {
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
                i.status === "HIDDEN"
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
                i.status === "HIDDEN"
            )
      : [];
  const items = marketRole === "seller" ? sellingFiltered : buyingFiltered;
  const sellerStatusCounts = {
    all: marketSellingAll.length,
    ongoing: marketSellingAll.filter((i) => i.status === "ACTIVE" || i.status === "LOCKED").length,
    ended: marketSellingAll.filter(
      (i) =>
        i.status === "COMPLETED" ||
        i.status === "EXPIRED" ||
        i.status === "DELETED" ||
        i.status === "HIDDEN"
    ).length,
  };
  const buyerStatusCounts = {
    all: marketBuyingAll.length,
    ongoing: marketBuyingAll.filter(
      (i) =>
        (i.status === "ACTIVE" && (i.hasIntention ?? true)) ||
        (i.status === "LOCKED" && i.selectedBuyerId === uid)
    ).length,
    ended: marketBuyingAll.filter(
      (i) =>
        i.status === "COMPLETED" ||
        i.status === "EXPIRED" ||
        i.status === "DELETED" ||
        i.status === "HIDDEN"
    ).length,
  };

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
          className={`overflow-x-hidden ${
            isMdAndUp
              ? "min-h-0 flex-1 overflow-y-auto scroll-momentum"
              : "overflow-visible"
          }`}
        >
          <div className="sticky top-0 z-20 rounded-t-xl border-x border-t border-[#EDEFF1] bg-white/90 px-4 pb-4 pt-4 backdrop-blur-md">
            <MarketStatusFilterBar
              role={marketRole}
              statusFilter={marketStatusFilter}
              sellingCount={marketSellingAll.length}
              buyingCount={marketBuyingAll.length}
              statusCounts={sellerStatusCounts}
              buyerStatusCounts={buyerStatusCounts}
              isSmallScreen={isSmallScreen}
              onRoleChange={(r) => {
                setMarketRole(r);
                setMarketStatusFilter("all");
              }}
              onStatusChange={setMarketStatusFilter}
            />
            {schoolName ? (
              <p className="mt-2 text-xs text-[#7C7C7C]">当前学校：{schoolName}</p>
            ) : null}
          </div>

          <div className="rounded-b-xl border-x border-b border-[#EDEFF1] bg-white p-6 pt-4">
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

        <MarketNotificationDropdown
          notifications={marketNotifications}
          isLoading={marketNotificationsLoading}
          isExpanded={marketSidebarExpanded}
          onToggle={() => setMarketSidebarExpanded(!marketSidebarExpanded)}
          onItemClick={handleMarketNotificationClick}
          onMarkAllRead={handleMarkAllMarketAsRead}
          unreadCount={marketUnread}
        />
      </div>

      <MarketNotificationList
          notifications={marketNotifications}
          isLoading={marketNotificationsLoading}
          onItemClick={handleMarketNotificationClick}
          onMarkAllRead={handleMarkAllMarketAsRead}
          containerClassName="hidden w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-[#EDEFF1] bg-white shadow-sm md:flex"
          unreadCount={marketUnread}
        />

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
