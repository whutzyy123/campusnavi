"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import Image from "next/image";
import { X, Plus, Loader2, MapPin, Package } from "lucide-react";
import { useMarketStore } from "@/store/use-market-store";
import { useSchoolStore } from "@/store/use-school-store";
import { useAuthStore } from "@/store/use-auth-store";
import toast from "react-hot-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  getPublicMarketItems,
  getMarketCategories,
} from "@/lib/market-actions";
import { getPOIsBySchool } from "@/lib/poi-actions";
import { PostItemModal } from "@/components/market/post-item-modal";
import { formatRelativeTime } from "@/lib/utils";

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

/** 共享内容区：筛选栏 + 商品列表 */
function MarketDrawerBody({
  filterTypeId,
  setFilterTypeId,
  filterCategoryId,
  setFilterCategoryId,
  filterPoiId,
  setFilterPoiId,
  transactionTypes,
  categoriesByType,
  allCategories,
  pois,
  items,
  loading,
  currentSchool,
  onItemClick,
  onPostClick,
  onClose,
  showPostModal,
  setShowPostModal,
  onPostSuccess,
  hasMore,
  onLoadMore,
}: {
  filterTypeId: number | "";
  setFilterTypeId: (v: number | "") => void;
  filterCategoryId: string;
  setFilterCategoryId: (v: string) => void;
  filterPoiId: string;
  setFilterPoiId: (v: string) => void;
  transactionTypes: TransactionTypeItem[];
  categoriesByType: MarketCategoriesByType;
  allCategories: MarketCategoryItem[];
  pois: Array<{ id: string; name: string }>;
  items: MarketItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  currentSchool: { id: string } | null;
  onItemClick: (item: MarketItem) => void;
  onPostClick: () => void;
  onClose: () => void;
  showPostModal: boolean;
  setShowPostModal: (v: boolean) => void;
  onPostSuccess: () => void;
}) {
  return (
    <>
      {/* 头部：标题 + 发布 + 关闭 */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-bold text-[#1A1A1B]">生存集市</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => currentSchool && setShowPostModal(true)}
            disabled={!currentSchool}
            className="flex items-center gap-1.5 rounded-full bg-[#FF4500] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#E03D00] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            发布
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!currentSchool ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
            请先在地图页选择学校后再使用生存集市
          </div>
        </div>
      ) : (
        <>
          {/* 筛选栏 */}
          <div className="shrink-0 border-b border-gray-200 p-3">
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">类型</span>
                <select
                  value={filterTypeId === "" ? "" : String(filterTypeId)}
                  onChange={(e) =>
                    setFilterTypeId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
          </div>

          {/* 商品列表：overflow-y-auto + no-scrollbar */}
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar scroll-momentum p-3">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                暂无商品，快来发布第一个吧
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const code = item.transactionType?.code ?? "";
                  const badgeClass = TRANSACTION_BADGE_STYLE[code] ?? "bg-gray-600/90 text-white";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onItemClick(item)}
                      className="group flex w-full flex-row overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:border-[#FF4500]/40 hover:shadow-md"
                    >
                      <div className="relative h-20 w-20 shrink-0 bg-gray-100 sm:h-24 sm:w-24">
                        {item.images[0] ? (
                          <Image
                            src={item.images[0]}
                            alt={item.title}
                            fill
                            className="object-cover"
                            sizes="96px"
                            unoptimized={item.images[0].startsWith("blob:")}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                            <Package className="h-8 w-8 sm:h-10 sm:w-10" />
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
                    onClick={onLoadMore}
                    className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-[#FF4500]/40 hover:bg-[#FFE5DD]/30 hover:text-[#FF4500]"
                  >
                    加载更多
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <PostItemModal
        isOpen={showPostModal}
        onClose={() => setShowPostModal(false)}
        onSuccess={onPostSuccess}
        schoolId={currentSchool?.id ?? ""}
        categoriesByType={categoriesByType}
        transactionTypes={transactionTypes}
      />
    </>
  );
}

export function MarketOverlayDrawer() {
  const { isOpen, closeMarket, selectItem, refreshTrigger } = useMarketStore();
  const { activeSchool, inspectedSchool } = useSchoolStore();
  const { currentUser } = useAuthStore();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [items, setItems] = useState<MarketItem[]>([]);
  const [categoriesByType, setCategoriesByType] = useState<MarketCategoriesByType>({});
  const [transactionTypes, setTransactionTypes] = useState<TransactionTypeItem[]>([]);
  const [pois, setPois] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);

  const [filterTypeId, setFilterTypeId] = useState<number | "">("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [filterPoiId, setFilterPoiId] = useState<string>("");
  const [snap, setSnap] = useState<number | string | null>(0.35);
  const [visibleCount, setVisibleCount] = useState(20);

  // 与首页一致：超级管理员视察 > 手动选择的 activeSchool
  const currentSchool = inspectedSchool || activeSchool;

  const ITEMS_PER_PAGE = 20;
  const displayedItems = items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [filterTypeId, filterCategoryId, filterPoiId, refreshTrigger]); // refreshTrigger: reset when list refreshed (e.g. after delete)

  useEffect(() => {
    if (isOpen && !isDesktop) {
      setSnap(0.35);
    }
  }, [isOpen, isDesktop]);

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
    const schoolId = currentSchool?.id;
    if (!schoolId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (process.env.NODE_ENV === "development") {
      console.log("[MarketOverlayDrawer] Fetching market for school:", schoolId);
    }
    try {
      const result = await getPublicMarketItems(schoolId, {
        typeId: filterTypeId !== "" ? filterTypeId : undefined,
        categoryId: filterCategoryId || undefined,
        poiId: filterPoiId || undefined,
      });
      if (!result.success) {
        console.error("[MarketOverlayDrawer] Fetch error:", result.error);
        setItems([]);
        toast.error(result.error ?? "加载商品失败");
        return;
      }
      if (Array.isArray(result.data)) {
        setItems(result.data);
      } else {
        setItems([]);
      }
    } catch (e) {
      console.error("[MarketOverlayDrawer] 获取商品列表失败:", e);
      setItems([]);
      toast.error("加载商品失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [currentSchool?.id, filterTypeId, filterCategoryId, filterPoiId]);

  const fetchPois = useCallback(async () => {
    if (!currentSchool?.id) {
      setPois([]);
      return;
    }
    try {
      const result = await getPOIsBySchool(currentSchool.id);
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
  }, [currentSchool?.id]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 仅在抽屉打开且有学校时拉取商品，避免无意义请求与 loading 残留
  useEffect(() => {
    if (!isOpen) return;
    if (!currentSchool?.id) {
      setLoading(false);
      setItems([]);
      return;
    }
    fetchItems();
  }, [isOpen, currentSchool?.id, fetchItems, refreshTrigger]);

  useEffect(() => {
    if (currentSchool?.id) {
      fetchPois();
    }
  }, [currentSchool?.id, fetchPois]);

  const allCategories = Array.from(
    new Map(Object.values(categoriesByType).flat().map((c) => [c.id, c])).values()
  ).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const handleItemClick = useCallback(
    (item: MarketItem) => {
      selectItem(item.id, item.poiId, item.title);
    },
    [selectItem]
  );

  // 未登录不渲染
  if (!currentUser) return null;

  const bodyProps = {
    filterTypeId,
    setFilterTypeId,
    filterCategoryId,
    setFilterCategoryId,
    filterPoiId,
    setFilterPoiId,
    transactionTypes,
    categoriesByType,
    allCategories,
    pois,
    items: displayedItems,
    loading,
    hasMore,
    onLoadMore: () => setVisibleCount((prev) => prev + ITEMS_PER_PAGE),
    currentSchool,
    onItemClick: handleItemClick,
    onPostClick: () => setShowPostModal(true),
    onClose: closeMarket,
    showPostModal,
    setShowPostModal,
    onPostSuccess: fetchItems,
  };

  return (
    <>
      {/* 桌面端：framer-motion 侧边栏，从右侧滑入 */}
      <AnimatePresence>
        {isOpen && isDesktop && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed below-nav right-0 bottom-0 left-0 z-[45] bg-black/40"
              onClick={closeMarket}
              aria-hidden
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 below-nav z-[50] flex h-below-nav w-full max-w-[400px] flex-col bg-white/95 shadow-2xl supports-[backdrop-filter]:bg-white/90 backdrop-blur-md"
            >
              <div className="flex h-full flex-col overflow-hidden">
                <MarketDrawerBody {...bodyProps} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 移动端：vaul Bottom Sheet */}
      {!isDesktop && (
        <Drawer.Root
          open={isOpen}
          onOpenChange={(open) => !open && closeMarket()}
          snapPoints={[0.35, 0.85]}
          activeSnapPoint={snap}
          setActiveSnapPoint={setSnap}
          fadeFromIndex={0}
          modal={false}
          dismissible
        >
          <Drawer.Portal>
            <Drawer.Overlay
              className={`fixed inset-0 z-[45] transition-colors duration-200 ${
                snap === 0.85 ? "bg-black/40 cursor-pointer" : "bg-transparent pointer-events-none"
              }`}
              onClick={snap === 0.85 ? closeMarket : undefined}
            />
            <Drawer.Content
              className="fixed bottom-0 left-0 right-0 z-[50] flex h-[85dvh] flex-col rounded-t-[14px] bg-white/95 shadow-2xl supports-[backdrop-filter]:bg-white/90 backdrop-blur-md focus:outline-none"
            >
              <div className="flex shrink-0 justify-center pt-4 pb-2">
                <div
                  className="h-1.5 w-12 rounded-full bg-gray-300"
                  aria-hidden
                />
              </div>
              <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                data-vaul-no-drag
              >
                <MarketDrawerBody {...bodyProps} />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}
