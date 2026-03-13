"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, Loader2, MapPin, Package } from "lucide-react";
import {
  getPublicMarketItems,
  getMarketCategories,
  getMarketItemDetail,
  submitIntention,
  reportMarketItem,
  deleteMarketItem,
} from "@/lib/market-actions";
import { getPOIsBySchool } from "@/lib/poi-actions";
import { useMarketStore } from "@/store/use-market-store";
import { PostItemModal } from "@/components/market/post-item-modal";
import { MarketItemDetailModal, type MarketItemDetailData } from "@/components/market/market-item-detail-modal";
import { UserProfileModal } from "@/components/shared/user-profile-modal";
import { formatRelativeTime } from "@/lib/utils";
import toast from "react-hot-toast";

interface MarketCategoryItem {
  id: string;
  name: string;
  order: number;
}

interface TransactionTypeItem {
  id: number;
  name: string;
  code: string;
  order: number;
}

type MarketCategoriesByType = Record<number, MarketCategoryItem[]>;

interface MarketItem {
  id: string;
  poiId: string;
  categoryId: string | null;
  typeId: number;
  transactionType: { id: number; name: string; code: string };
  title: string;
  description: string;
  price: number | null;
  images: string[];
  status: string;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
}

const TRANSACTION_BADGE_STYLE: Record<string, string> = {
  SALE: "bg-orange-500/90 text-white",
  SWAP: "bg-blue-500/90 text-white",
  BORROW: "bg-emerald-500/90 text-white",
};

const ITEMS_PER_PAGE = 20;

export interface MarketSchoolListProps {
  schoolId: string | null;
  schoolName?: string | null;
  currentUser: { id: string } | null;
  /** 初始选中的商品 ID（深度链接） */
  initialOpenItemId?: string | null;
}

export function MarketSchoolList({
  schoolId,
  schoolName,
  currentUser,
  initialOpenItemId,
}: MarketSchoolListProps) {
  const router = useRouter();
  const [items, setItems] = useState<MarketItem[]>([]);
  const [categoriesByType, setCategoriesByType] = useState<MarketCategoriesByType>({});
  const [transactionTypes, setTransactionTypes] = useState<TransactionTypeItem[]>([]);
  const [pois, setPois] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const [filterTypeId, setFilterTypeId] = useState<number | "">("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [filterPoiId, setFilterPoiId] = useState<string>("");

  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialOpenItemId ?? null);
  const [detailItem, setDetailItem] = useState<MarketItemDetailData | null>(null);
  const [submittingIntentionId, setSubmittingIntentionId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  const displayedItems = items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;

  const fetchCategories = useCallback(async () => {
    try {
      const result = await getMarketCategories();
      if (result.success && result.data) {
        setCategoriesByType(result.data.data);
        setTransactionTypes(result.data.transactionTypes);
      }
    } catch (e) {
      console.error("获取分类失败:", e);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    if (!schoolId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getPublicMarketItems(schoolId, {
        typeId: filterTypeId !== "" ? filterTypeId : undefined,
        categoryId: filterCategoryId || undefined,
        poiId: filterPoiId || undefined,
      });
      if (!result.success) {
        setItems([]);
        toast.error(result.error ?? "加载商品失败");
        return;
      }
      setItems(Array.isArray(result.data) ? result.data : []);
    } catch (e) {
      console.error("获取商品列表失败:", e);
      setItems([]);
      toast.error("加载商品失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [schoolId, filterTypeId, filterCategoryId, filterPoiId]);

  const fetchPois = useCallback(async () => {
    if (!schoolId) {
      setPois([]);
      return;
    }
    try {
      const result = await getPOIsBySchool(schoolId);
      if (result.success && result.data?.pois) {
        setPois(
          result.data.pois.map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          }))
        );
      }
    } catch (e) {
      console.error("获取 POI 列表失败:", e);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (schoolId) {
      fetchItems();
      fetchPois();
    } else {
      setItems([]);
      setPois([]);
      setLoading(false);
    }
  }, [schoolId, fetchItems, fetchPois]);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [filterTypeId, filterCategoryId, filterPoiId]);

  const allCategories = Array.from(
    new Map(Object.values(categoriesByType).flat().map((c) => [c.id, c])).values()
  ).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

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
        setSelectedItemId(null);
      }
    } catch {
      toast.error("加载失败");
      setSelectedItemId(null);
    }
  }, []);

  useEffect(() => {
    if (!selectedItemId) {
      setDetailItem(null);
      return;
    }
    fetchDetail(selectedItemId);
  }, [selectedItemId, fetchDetail]);

  useEffect(() => {
    if (initialOpenItemId && schoolId) {
      setSelectedItemId(initialOpenItemId);
    }
  }, [initialOpenItemId, schoolId]);

  const handleItemClick = useCallback((item: MarketItem) => {
    setSelectedItemId(item.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedItemId(null);
    setDetailItem(null);
  }, []);

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

  const handleReport = async () => {
    if (!detailItem) return;
    const result = await reportMarketItem(detailItem.id);
    if (result.success) {
      toast.success("举报已提交");
      handleCloseDetail();
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
        handleCloseDetail();
        fetchItems();
      } else {
        toast.error(result.error ?? "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handlePostSuccess = useCallback(() => {
    fetchItems();
    setShowPostModal(false);
  }, [fetchItems]);

  const selectItem = useMarketStore((s) => s.selectItem);
  const openMarket = useMarketStore((s) => s.openMarket);
  const handleViewOnMap = useCallback(() => {
    if (!detailItem) return;
    selectItem(detailItem.id, detailItem.poi?.id ?? null, detailItem.title);
    openMarket();
    handleCloseDetail();
    router.push("/");
  }, [detailItem, selectItem, openMarket, handleCloseDetail, router]);

  if (!currentUser) return null;

  if (!schoolId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <Package className="mb-4 h-12 w-12 text-amber-500" />
        <p className="text-sm font-medium text-amber-800">请先在地图页选择学校或绑定学校</p>
        <p className="mt-1 text-xs text-amber-700">生存集市按学校展示，需选择学校后才能浏览与发布</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {/* 筛选栏 + 发布 */}
        <div className="flex-shrink-0 border-b border-[#EDEFF1] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">类型</span>
                <select
                  value={filterTypeId === "" ? "" : String(filterTypeId)}
                  onChange={(e) =>
                    setFilterTypeId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  {transactionTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">分类</span>
                <select
                  value={filterCategoryId}
                  onChange={(e) => setFilterCategoryId(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">地点</span>
                <select
                  value={filterPoiId}
                  onChange={(e) => setFilterPoiId(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  {pois.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => setShowPostModal(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E03D00]"
            >
              <Plus className="h-4 w-4" />
              发布
            </button>
          </div>
          {schoolName && (
            <p className="mt-2 text-xs text-[#7C7C7C]">
              当前学校：{schoolName}
            </p>
          )}
        </div>

        {/* 商品列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-[#EDEFF1] bg-white p-12 text-center">
              <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500">暂无商品，快来发布第一个吧</p>
              <button
                onClick={() => setShowPostModal(true)}
                className="mt-4 rounded-full bg-[#FF4500] px-6 py-2 text-sm font-medium text-white hover:bg-[#E03D00]"
              >
                发布商品
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayedItems.map((item) => {
                const code = item.transactionType?.code ?? "";
                const badgeClass = TRANSACTION_BADGE_STYLE[code] ?? "bg-gray-600/90 text-white";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="group flex w-full flex-row overflow-hidden rounded-xl border border-[#EDEFF1] bg-white text-left shadow-sm transition-all hover:border-[#FF4500]/40 hover:shadow-md"
                  >
                    <div className="relative h-24 w-24 shrink-0 bg-gray-100 sm:h-28 sm:w-28">
                      {item.images[0] ? (
                        <Image
                          src={item.images[0]}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="112px"
                          unoptimized={item.images[0].startsWith("blob:")}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                          <Package className="h-10 w-10" />
                        </div>
                      )}
                      <div
                        className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-xs font-medium ${badgeClass}`}
                      >
                        {item.transactionType?.name ?? "—"}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col justify-between overflow-hidden p-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-sm font-medium text-[#1A1A1B] group-hover:text-[#FF4500]">
                          {item.title}
                        </h3>
                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.poi?.name ?? "—"}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        {item.transactionType?.code === "SALE" && item.price != null ? (
                          <span className="font-bold text-orange-600">¥{item.price}</span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            {item.transactionType?.name ?? "—"}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-gray-400">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
                  className="col-span-full rounded-xl border border-dashed border-gray-300 py-4 text-sm font-medium text-gray-600 transition-colors hover:border-[#FF4500]/40 hover:bg-[#FFE5DD]/30 hover:text-[#FF4500]"
                >
                  加载更多
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <PostItemModal
        isOpen={showPostModal}
        onClose={() => setShowPostModal(false)}
        onSuccess={handlePostSuccess}
        schoolId={schoolId}
        categoriesByType={categoriesByType}
        transactionTypes={transactionTypes}
      />

      <MarketItemDetailModal
        isOpen={!!selectedItemId && !!detailItem}
        onClose={handleCloseDetail}
        item={detailItem}
        currentUser={currentUser}
        variant="market"
        onSubmitIntention={handleSubmitIntention}
        onReport={handleReport}
        onIntentionSubmitted={handleIntentionSubmitted}
        submittingIntentionId={submittingIntentionId}
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
