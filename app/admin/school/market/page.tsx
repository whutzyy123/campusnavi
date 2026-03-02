"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { useDebounce } from "@/hooks/use-debounce";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { ShoppingBag, Loader2, Trash2, RotateCcw, EyeOff, History } from "lucide-react";
import { TableActions } from "@/components/ui/table-actions";
import toast from "react-hot-toast";
import Image from "next/image";
import { MarketAuditDrawer } from "@/components/admin/market-audit-drawer";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { getMarketCategories } from "@/lib/market-actions";
import { formatDate } from "@/lib/utils";

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
  isHidden: boolean;
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
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const [items, setItems] = useState<MarketItemRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const fetchItems = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ schoolId });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterCategory) params.set("categoryId", filterCategory);
      if (filterStatus) params.set("status", filterStatus);
      params.set("page", "1");
      params.set("limit", "20");
      const res = await fetch(`/api/admin/market/items?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data ?? []);
        setPagination(data.pagination ?? null);
      } else {
        toast.error(data.message ?? "获取列表失败");
      }
    } catch (e) {
      toast.error("获取列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, debouncedSearch, filterCategory, filterStatus]);

  const handleAdminAction = useCallback(
    async (itemId: string, action: "delete" | "relist") => {
      if (processingActionId) return;
      setProcessingActionId(itemId);
      try {
        const res = await fetch(`/api/admin/market/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (data.success) {
          const msg = data.message ?? (action === "delete" ? "操作成功" : "已重新上架");
          toast.success(msg.includes("彻底删除") ? "物品已从数据库永久删除" : msg);
          await fetchItems();
          router.refresh();
        } else {
          console.error("[AdminMarket] 操作失败:", res.status, data.message ?? data.error);
          toast.error(data.message ?? "操作失败");
        }
      } catch (e) {
        console.error("[AdminMarket] 请求异常:", e);
        toast.error("操作失败，请重试");
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
          <div className="p-6">
            <Card title="生存集市管理">
              <EmptyState
                icon={ShoppingBag}
                title="无学校绑定"
                description="您需要绑定学校后才能管理生存集市"
              />
            </Card>
          </div>
        </AdminLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-4 lg:p-6">
          <Card title="生存集市管理">
            {/* 状态筛选 Tab */}
            <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
              {STATUS_FILTERS.map(({ value, label }) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setFilterStatus(value)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    filterStatus === value
                      ? "bg-[#FF4500] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-4">
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
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="暂无商品"
                description="当前没有符合条件的商品"
              />
            ) : (
              <div className="w-full min-w-0 overflow-x-auto">
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
                          {item.isHidden ? (
                            <StatusBadge domain="market" status="HIDDEN" />
                          ) : (
                            <StatusBadge domain="market" status={item.status} />
                          )}
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          {item.reportCount > 0 ? (
                            <StatusBadge domain="market" status="HIDDEN" labelOverride={`${item.reportCount} 次`} variantOverride="error" />
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
                              const canRelist =
                                item.isHidden && (item.status === "ACTIVE" || item.status === "LOCKED");
                              const canHide =
                                (item.status === "ACTIVE" || item.status === "LOCKED") &&
                                !item.isHidden &&
                                !(item.status === "ACTIVE" && new Date(item.expiresAt) < new Date());
                              const canDelete =
                                item.isHidden ||
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
                                    if (confirm("确定要下架此物品吗？下架后用户将无法在集市看到它。")) {
                                      handleAdminAction(item.id, "delete");
                                    }
                                  },
                                });
                              }
                              if (canDelete) {
                                tail.push({
                                  label: "彻底删除",
                                  icon: Trash2,
                                  onClick: () => {
                                    if (confirm("确定要彻底删除此物品吗？此操作不可恢复，将从数据库中永久移除。")) {
                                      handleAdminAction(item.id, "delete");
                                    }
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
              </div>
            )}
          </Card>

          <MarketAuditDrawer
            itemId={auditDrawerItemId}
            isOpen={!!auditDrawerItemId}
            onClose={() => setAuditDrawerItemId(null)}
          />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
