"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  getMarketItemDetail,
  reportMarketItem,
  submitIntention,
  selectBuyerAndLock,
  deleteMarketItem,
} from "@/lib/market-actions";
import { useMarketStore } from "@/store/use-market-store";
import { useSchoolStore } from "@/store/use-school-store";
import { useAuthStore } from "@/store/use-auth-store";
import { MarketItemDetailModal, type MarketItemDetailData } from "@/components/market/market-item-detail-modal";
import { UserProfileModal } from "@/components/shared/user-profile-modal";

/**
 * 地图页全局集市商品详情 Modal 控制器
 * 监听 selectedItemId，拉取详情并展示 Modal（variant="map"，z-[210]，无「在地图中查看」）
 */
export function MarketItemDetailModalController() {
  const selectedItemId = useMarketStore((s) => s.selectedItemId);
  const focusMode = useMarketStore((s) => s.focusMode);
  const selectItem = useMarketStore((s) => s.selectItem);
  const setFocusMode = useMarketStore((s) => s.setFocusMode);
  const triggerRefresh = useMarketStore((s) => s.triggerRefresh);
  const setHighlightPoi = useSchoolStore((s) => s.setHighlightPoi);
  const { currentUser } = useAuthStore();

  const [detailItem, setDetailItem] = useState<MarketItemDetailData | null>(null);
  const [submittingIntentionId, setSubmittingIntentionId] = useState<string | null>(null);
  const [selectingBuyerId, setSelectingBuyerId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  const fetchDetail = useCallback(async (id: string) => {
    setSubmittingIntentionId(null);
    try {
      const result = await getMarketItemDetail(id);
      if (result.success && result.data) {
        const d = result.data as MarketItemDetailData;
        if (d.masked) {
          setDetailItem({
            ...d,
            title: "内容已被屏蔽",
            description: d.message ?? "该商品因被举报次数过多已被屏蔽。",
            images: [],
            poi: { id: "", name: "—" },
            category: { id: "", name: "—" },
            user: { id: "", nickname: null },
            buyerId: null,
            selectedBuyerId: null,
            hasSubmittedIntention: false,
          });
        } else {
          setDetailItem(d);
        }
      } else {
        toast.error(result.error ?? "商品不存在或已下架");
        selectItem(null);
      }
    } catch {
      toast.error("加载失败");
      selectItem(null);
    }
  }, [selectItem]);

  useEffect(() => {
    if (!selectedItemId) {
      setDetailItem(null);
      return;
    }
    fetchDetail(selectedItemId);
  }, [selectedItemId, fetchDetail]);

  const handleClose = useCallback(() => {
    selectItem(null);
    setHighlightPoi(null);
  }, [selectItem, setHighlightPoi]);

  const handleSubmitIntention = async (itemId: string, contactInfo: string | null) => {
    setSubmittingIntentionId(itemId);
    try {
      const result = await submitIntention(itemId, contactInfo);
      if (result.success) {
        toast.success("已提交意向，请联系卖家");
        return { success: true };
      }
      toast.error(result.error ?? "操作失败");
      return { success: false, error: result.error };
    } catch {
      toast.error("操作失败，请重试");
      return { success: false, error: "操作失败" };
    } finally {
      setSubmittingIntentionId(null);
    }
  };

  const handleIntentionSubmitted = async () => {
    if (!detailItem) return;
    try {
      const result = await getMarketItemDetail(detailItem.id);
      if (result.success && result.data) {
        setDetailItem(result.data as MarketItemDetailData);
      }
    } catch {
      // ignore
    }
  };

  const handleSelectBuyerAndLock = async (itemId: string, buyerId: string) => {
    setSelectingBuyerId(buyerId);
    try {
      const result = await selectBuyerAndLock(itemId, buyerId);
      if (result.success) {
        toast.success("已选定并锁定");
        await handleIntentionSubmitted();
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

  const handleReport = async () => {
    if (!detailItem) return;
    const result = await reportMarketItem(detailItem.id);
    if (result.success) {
      toast.success("举报已提交");
      handleClose();
    } else {
      toast.error(result.error ?? "举报失败");
    }
  };

  const handleDelete = async () => {
    if (!detailItem) return;
    if (!confirm("确定要删除该商品吗？")) return;
    setDeletingItemId(detailItem.id);
    try {
      const result = await deleteMarketItem(detailItem.id);
      if (result.success) {
        toast.success("已删除");
        handleClose();
        triggerRefresh();
      } else {
        toast.error(result.error ?? "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleEdit = () => {
    // 编辑：关闭详情，由 drawer 内的 PostItemModal 处理（暂不实现，保持与 market 页一致）
    handleClose();
  };

  const handleViewOnMap = useCallback(() => {
    if (!detailItem) return;
    // 确保 selectedItemPoiId 已设置（URL 直链时可能尚未有 poiId）
    selectItem(detailItem.id, detailItem.poi?.id ?? null, detailItem.title);
    setFocusMode(true);
    // 不调用 onClose/closeMarket：setFocusMode(true) 会关闭 drawer，showModal 条件会关闭 modal
  }, [detailItem, selectItem, setFocusMode]);

  if (!currentUser) return null;

  const showModal = !!selectedItemId && !!detailItem && !focusMode;

  return (
    <>
      <MarketItemDetailModal
        isOpen={showModal}
        onClose={handleClose}
        item={detailItem}
        currentUser={currentUser}
        variant="map"
        onSubmitIntention={handleSubmitIntention}
        onSelectBuyerAndLock={handleSelectBuyerAndLock}
        onReport={handleReport}
        onEdit={handleEdit}
        onIntentionSubmitted={handleIntentionSubmitted}
        submittingIntentionId={submittingIntentionId}
        selectingBuyerId={selectingBuyerId}
        deletingItemId={deletingItemId}
        onViewOnMap={handleViewOnMap}
        onViewUserProfile={setProfileModalUserId}
      />
      <UserProfileModal
        userId={profileModalUserId}
        isOpen={!!profileModalUserId}
        onClose={() => setProfileModalUserId(null)}
      />
    </>
  );
}
