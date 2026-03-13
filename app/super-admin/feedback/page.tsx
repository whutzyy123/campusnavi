"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { useAuthStore } from "@/store/use-auth-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Modal } from "@/components/ui/modal";
import {
  getAdminFeedbacks,
  getFeedbackById,
  updateFeedbackStatus,
  type FeedbackItem,
} from "@/lib/feedback-actions";
import { MessageCircle, Loader2, X, MessageSquare, Bug } from "lucide-react";
import toast from "react-hot-toast";

function getTypeLabel(type: string): string {
  return type === "FEEDBACK" ? "使用体验反馈" : "Bug 提交";
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "待处理";
    case "RESOLVED":
      return "已解决";
    case "REJECTED":
      return "已驳回";
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "RESOLVED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function SuperAdminFeedbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SuperAdminFeedbackPageContent />
    </Suspense>
  );
}

function SuperAdminFeedbackPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [filterType, setFilterType] = useState<string>(() => searchParams.get("type") || "");
  const [filterStatus, setFilterStatus] = useState<string>(() => searchParams.get("status") || "");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const fetchFeedbacks = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAdminFeedbacks({
        page: currentPage,
        limit: 10,
        type: filterType === "FEEDBACK" || filterType === "BUG" ? (filterType as "FEEDBACK" | "BUG") : undefined,
        status:
          filterStatus === "PENDING" || filterStatus === "RESOLVED" || filterStatus === "REJECTED"
            ? (filterStatus as "PENDING" | "RESOLVED" | "REJECTED")
            : undefined,
      });
      if (result.success && result.data) {
        setItems(result.data.data);
        setPagination({
          total: result.data.total,
          pageCount: result.data.pageCount,
          currentPage: result.data.currentPage,
        });
      } else {
        setItems([]);
        setPagination(null);
      }
    } catch (err) {
      console.error("获取反馈列表失败:", err);
      toast.error("获取反馈列表失败");
      setItems([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [currentPage, filterType, filterStatus]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const updateFilterUrl = useCallback(
    (type: string, status: string) => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router]
  );

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailItem(null);
    setIsLoadingDetail(true);
    try {
      const result = await getFeedbackById(
        id,
        currentUser?.id ?? "",
        currentUser?.role === "SUPER_ADMIN"
      );
      if (result.success && result.data) {
        setDetailItem(result.data);
      } else {
        toast.error(result.error || "获取详情失败");
        setDetailId(null);
      }
    } catch {
      toast.error("获取详情失败");
      setDetailId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetailItem(null);
  };

  const handleUpdateStatus = async (id: string, status: "PENDING" | "RESOLVED" | "REJECTED") => {
    setUpdatingId(id);
    setUpdatingStatus(status);
    try {
      const result = await updateFeedbackStatus(id, status);
      if (result.success) {
        toast.success("状态已更新");
        fetchFeedbacks();
        if (detailId === id && detailItem) {
          setDetailItem({ ...detailItem, status });
        }
      } else {
        toast.error(result.error || "更新失败");
      }
    } catch {
      toast.error("更新失败");
    } finally {
      setUpdatingId(null);
      setUpdatingStatus(null);
    }
  };

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="box-border p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-900">反馈管理</h1>
            <p className="text-sm text-gray-600">查看用户提交的使用体验反馈与 Bug 报告</p>
          </div>

          <Card className="p-6">
            {/* 筛选 */}
            <div className="mb-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">类型</span>
                <select
                  value={filterType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterType(v);
                    updateFilterUrl(v, filterStatus);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  <option value="FEEDBACK">使用体验反馈</option>
                  <option value="BUG">Bug 提交</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">状态</span>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterStatus(v);
                    updateFilterUrl(filterType, v);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  <option value="PENDING">待处理</option>
                  <option value="RESOLVED">已解决</option>
                  <option value="REJECTED">已驳回</option>
                </select>
              </div>
            </div>

            {/* 列表 */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title="暂无反馈"
                description="用户提交的反馈将在此展示"
              />
            ) : (
              <div className="min-h-[500px] flex flex-col">
                <div className="flex-1 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>类型</TableHead>
                        <TableHead>标题</TableHead>
                        <TableHead>提交用户</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>提交时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                              {item.type === "FEEDBACK" ? (
                                <MessageSquare className="h-4 w-4" />
                              ) : (
                                <Bug className="h-4 w-4" />
                              )}
                              {getTypeLabel(item.type)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate text-sm font-medium text-gray-900">
                              {item.title}
                            </div>
                          </TableCell>
                          <TableCell>{item.user?.nickname || item.user?.email || "-"}</TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(item.status)}`}
                            >
                              {getStatusLabel(item.status)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(item.createdAt).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              onClick={() => openDetail(item.id)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              查看详情
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {pagination && pagination.pageCount > 1 && (
                  <div className="mt-6 flex justify-center pb-8">
                    <PaginationControls
                      total={pagination.total}
                      pageCount={pagination.pageCount}
                      currentPage={pagination.currentPage}
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* 详情弹窗 */}
        <Modal isOpen={!!detailId} onClose={closeDetail} containerClassName="max-w-lg">
          <div className="flex max-h-[min(85vh,calc(100vh-40px))] flex-col overflow-hidden rounded-xl bg-white">
            <div className="modal-header flex items-center justify-between px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">反馈详情</h3>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="modal-body overflow-y-auto px-6 py-4">
              {isLoadingDetail ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
                </div>
              ) : detailItem ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-gray-500">类型</span>
                    <p className="mt-1 text-sm font-medium">{getTypeLabel(detailItem.type)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">标题</span>
                    <p className="mt-1 text-sm font-medium">{detailItem.title}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">提交用户</span>
                    <p className="mt-1 text-sm">
                      {detailItem.user?.nickname || detailItem.user?.email || "-"}
                    </p>
                  </div>
                  {(detailItem.images?.length ?? 0) > 0 && (
                    <div>
                      <span className="text-xs text-gray-500">图片</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {detailItem.images.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200"
                          >
                            <Image
                              src={url}
                              alt={`图片 ${i + 1}`}
                              fill
                              className="object-cover"
                              unoptimized={url.startsWith("blob:")}
                              sizes="96px"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-gray-500">详情内容</span>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">
                      {detailItem.content}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">提交时间</span>
                    <p className="mt-1 text-sm">
                      {new Date(detailItem.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">状态</span>
                    <div className="mt-2 flex gap-2">
                      {(["PENDING", "RESOLVED", "REJECTED"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleUpdateStatus(detailItem.id, s)}
                          disabled={updatingId === detailItem.id || detailItem.status === s}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            detailItem.status === s
                              ? getStatusClass(s)
                              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {updatingId === detailItem.id && updatingStatus === s ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            getStatusLabel(s)
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Modal>
      </AdminLayout>
    </AuthGuard>
  );
}
