"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { useDebounce } from "@/hooks/use-debounce";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { AdminPageContainer } from "@/components/admin/admin-page-container";
import { ListPageScaffold } from "@/components/admin/list-page-scaffold";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { ShoppingBag, Trash2, RotateCcw, EyeOff, History } from "lucide-react";
import { TableActions } from "@/components/ui/table-actions";
import { notify } from "@/lib/ui/notify";
import Image from "next/image";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { MarketAuditDrawer } from "@/components/admin/market-audit-drawer";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Button } from "@/components/ui/button";
import { openConfirm } from "@/components/ui/confirm-dialog";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  getAdminMarketItems,
  adminMarketItemAction,
  getMarketCategories,
} from "@/lib/market";
import { formatDate } from "@/lib/core/utils";

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "ACTIVE", label: "在售" },
  { value: "LOCKED", label: "已锁定" },
  { value: "COMPLETED", label: "已完成" },
  { value: "DELETED", label: "已删除" },
] as const;

interface MarketItemRow {
  id: string;
  title: string;
  typeId: number;
  transactionType: { id: number; name: string; code: string } | null;
  status: string;
  reportCount: number;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null; email: string };
  buyer: { id: string; nickname: string | null; email: string } | null;
  buyerId: string | null;
  category: { id: string; name: string };
  poi: { id: string; name: string };
  images: string[];
  price: number | null;
}

export default function AdminMarketPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminMarketPageContent />
    </Suspense>
  );
}

function AdminMarketPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [items, setItems] = useState<MarketItemRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const [auditDrawerItemId, setAuditDrawerItemId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
    limit: number;
  } | null>(null);

  const schoolId = currentUser?.schoolId;
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const fetchItems = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setListError(null);
    try {
      const result = await getAdminMarketItems(schoolId, {
        search: debouncedSearch || undefined,
        categoryId: filterCategory || undefined,
        status: filterStatus || undefined,
        page: currentPage,
        limit: 20,
      });
      if (result.success && result.data) {
        const rows = (result.data.data ?? []).map((m) => ({
          ...m,
          user: { ...m.user, email: m.user.email ?? "" },
          buyer: m.buyer ? { ...m.buyer, email: m.buyer.email ?? "" } : null,
          category: m.category ?? { id: "", name: "未分类" },
          poi: m.poi ?? { id: "", name: "" },
        }));
        setItems(rows);
        setPagination(result.data.pagination ?? null);
      } else {
        setItems([]);
        setPagination(null);
        setListError(result.success === false ? (result.error ?? "获取列表失败") : "获取列表失败");
      }
    } catch {
      setItems([]);
      setPagination(null);
      setListError("获取列表失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, debouncedSearch, filterCategory, filterStatus, currentPage]);

  const goToPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) params.delete("page");
      else params.set("page", String(page));
      const query = params.toString();
      router.replace(query ? `/admin/school/market?${query}` : "/admin/school/market");
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (currentPage > 1) {
      goToPage(1);
    }
  }, [debouncedSearch, filterCategory, filterStatus, currentPage, goToPage]);

  const handleAdminAction = useCallback(
    async (itemId: string, action: "delete" | "relist") => {
      if (processingActionId) return;
      setProcessingActionId(itemId);
      try {
        const result = await adminMarketItemAction(itemId, action);
        if (result.success) {
          const msg = result.data?.message ?? (action === "delete" ? "操作成功" : "已重新上架");
          notify.success(msg.includes("彻底删除") ? "物品已从数据库永久删除" : msg);
          await fetchItems();
          router.refresh();
        } else {
          console.error("[AdminMarket] 操作失败:", result.error);
          notify.error(result.error ?? "操作失败");
        }
      } catch (e) {
        console.error("[AdminMarket] 请求异常:", e);
        notify.error("操作失败，请重试");
      } finally {
        setProcessingActionId(null);
      }
    },
    [processingActionId, fetchItems, router]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const result = await getMarketCategories();
      if (result.success && result.data?.data) {
        const grouped = result.data.data;
        const leaf = Object.values(grouped).flat();
        const unique = Array.from(new Map(leaf.map((c) => [c.id, c])).values());
        setCategories(unique);
      }
    } catch (e) {
      console.error("获取分类失败", e);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  if (!schoolId) {
    return (
      <AuthGuard requiredRole="ADMIN">
        <AdminLayout>
          <AdminPageContainer title="生存集市管理" description="管理本校生存集市商品">
            <EmptyState
              icon={ShoppingBag}
              title="无学校绑定"
              description="您需要绑定学校后才能管理生存集市"
            />
          </AdminPageContainer>
        </AdminLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <AdminPageContainer
          title="生存集市管理"
          description="管理本校生存集市商品"
          scrollKey={`${debouncedSearch}-${filterCategory}-${filterStatus}-${currentPage}`}
        >
          <ListPageScaffold
            filters={
              <>
                <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                  {STATUS_FILTERS.map(({ value, label }) => (
                    <Button
                      key={value || "all"}
                      type="button"
                      variant={filterStatus === value ? "primary" : "secondary"}
                      onClick={() => {
                        setFilterStatus(value);
                      }}
                      className={
                        filterStatus !== value
                          ? "border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200"
                          : undefined
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <AdminFilterBar
                  search={{
                    value: searchTerm,
                    onChange: setSearchTerm,
                    placeholder: "搜索标题或用户...",
                  }}
                  filters={[
                    {
                      label: "分类",
                      value: filterCategory,
                      onChange: setFilterCategory,
                      options: [
                        { value: "", label: "全部分类" },
                        ...categories.map((c) => ({ value: c.id, label: c.name })),
                      ],
                    },
                  ]}
                />
              </>
            }
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white shadow">
              <div className="custom-scrollbar flex h-full min-h-0 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto p-6">
                  {listError ? (
                    <PageError description={listError} onRetry={fetchItems} />
                  ) : isLoading ? (
                    <PageLoading className="flex justify-center py-12" />
                  ) : items.length === 0 ? (
                    <EmptyState
                      icon={ShoppingBag}
                      title="暂无商品"
                      description="当前没有符合条件的商品"
                    />
                  ) : (
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead responsiveHide="sm">图片</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead responsiveHide="sm">类型</TableHead>
                      <TableHead responsiveHide="sm">分类</TableHead>
                      <TableHead responsiveHide="sm">卖家</TableHead>
                      <TableHead responsiveHide="sm">买家</TableHead>
                      <TableHead responsiveHide="sm">地点</TableHead>
                      <TableHead responsiveHide="sm">状态</TableHead>
                      <TableHead responsiveHide="sm">举报</TableHead>
                      <TableHead responsiveHide="lg">创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell responsiveHide="sm">
                          {item.images[0] ? (
                            <div className="relative h-12 w-12 overflow-hidden rounded">
                              <Image
                                src={item.images[0]}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="48px"
                                unoptimized={item.images[0].startsWith("blob:")}
                              />
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{item.title}</span>
                        </TableCell>
                        <TableCell responsiveHide="sm">{item.transactionType?.name ?? "—"}</TableCell>
                        <TableCell responsiveHide="sm">{item.category?.name ?? "—"}</TableCell>
                        <TableCell responsiveHide="sm">
                          {item.user?.nickname ?? item.user?.email ?? "—"}
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          {(item.status === "LOCKED" || item.status === "COMPLETED") && item.buyer
                            ? item.buyer.nickname ?? item.buyer.email ?? "—"
                            : "—"}
                        </TableCell>
                        <TableCell responsiveHide="sm">{item.poi?.name ?? "—"}</TableCell>
                        <TableCell responsiveHide="sm">
                          <StatusBadge domain="market" status={item.status} />
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          {item.reportCount > 0 ? (
                            <StatusBadge domain="market" status="REPORTED" labelOverride={`${item.reportCount} 次`} variantOverride="error" />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500" responsiveHide="lg">
                          {formatDate(item.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <TableActions
                            disabled={processingActionId === item.id}
                            items={(() => {
                              const isHidden = item.status === "HIDDEN";
                              const canRelist =
                                isHidden;
                              const canHide =
                                !isHidden &&
                                (item.status === "ACTIVE" || item.status === "LOCKED") &&
                                !(item.status === "ACTIVE" && new Date(item.expiresAt) < new Date());
                              const canDelete =
                                isHidden ||
                                item.status === "COMPLETED" ||
                                item.status === "DELETED" ||
                                (item.status === "ACTIVE" && new Date(item.expiresAt) < new Date());

                              const tail: Parameters<typeof TableActions>[0]["items"] = [];
                              if (canRelist) {
                                tail.push({
                                  label: "重新上架",
                                  icon: RotateCcw,
                                  onClick: () => handleAdminAction(item.id, "relist"),
                                });
                              }
                              if (canHide) {
                                tail.push({
                                  label: "下架",
                                  icon: EyeOff,
                                  onClick: () => {
                                    openConfirm({
                                      title: "下架物品",
                                      description: "确定要下架此物品吗？下架后用户将无法在集市看到它。",
                                      confirmText: "下架",
                                      onConfirm: () => handleAdminAction(item.id, "delete"),
                                    });
                                  },
                                });
                              }
                              if (canDelete) {
                                tail.push({
                                  label: "彻底删除",
                                  icon: Trash2,
                                  onClick: () => {
                                    openConfirm({
                                      title: "彻底删除物品",
                                      description:
                                        "确定要彻底删除此物品吗？此操作不可恢复，将从数据库中永久移除。",
                                      variant: "danger",
                                      confirmText: "删除",
                                      onConfirm: () => handleAdminAction(item.id, "delete"),
                                    });
                                  },
                                  variant: "destructive",
                                });
                              }

                              return [
                                { label: "查看日志", icon: History, onClick: () => setAuditDrawerItemId(item.id) },
                                ...(tail.length > 0 ? (["separator", ...tail] as const) : []),
                              ];
                            })()}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                    </Table>
                  )}
                </div>
                {pagination && pagination.total > 0 ? (
                  <div className="flex flex-shrink-0 justify-center border-t border-gray-100 py-4">
                    <PaginationControls
                      total={pagination.total}
                      pageCount={pagination.pageCount}
                      currentPage={pagination.currentPage}
                      limit={pagination.limit}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </ListPageScaffold>
        </AdminPageContainer>

        <MarketAuditDrawer
          itemId={auditDrawerItemId}
          isOpen={!!auditDrawerItemId}
          onClose={() => setAuditDrawerItemId(null)}
        />
      </AdminLayout>
    </AuthGuard>
  );
}
