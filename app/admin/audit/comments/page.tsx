"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Trash2, CheckCircle2, MapPin, X, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import {
  getAuditComments,
  getAuditCommentCounts,
  reviewComment,
  hardDeleteComment,
  hardDeleteComments,
} from "@/lib/comment-actions";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface CommentForAudit {
  id: string;
  content: string;
  createdAt: string;
  reportCount: number;
  isHidden: boolean;
  isReviewed?: boolean;
  reviewedAt?: string | null;
  reviewer?: { id: string; nickname: string | null; email: string | null } | null;
  user: {
    id: string;
    nickname: string | null;
    email: string | null;
    avatar: string | null;
  };
  poi: {
    id: string;
    name: string;
    category: string;
  };
}

/**
 * 留言审核后台
 * 待处理：reportCount>=3 且未审核
 * 已处理：isReviewed=true，展示审核历史
 */
export default function CommentAuditPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CommentAuditPageContent />
    </Suspense>
  );
}

function CommentAuditPageContent() {
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [comments, setComments] = useState<CommentForAudit[]>([]);
  const [counts, setCounts] = useState<{ pending: number; processed: number }>({ pending: 0, processed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailComment, setDetailComment] = useState<CommentForAudit | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const schoolId = currentUser?.schoolId;
  const canPermanentDeleteInPending = false; // 仅已审核留言可永久删除
  const statusFilter = (searchParams.get("status") || "pending") as "pending" | "processed";

  const fetchCounts = useCallback(async () => {
    if (!schoolId) return;
    try {
      const result = await getAuditCommentCounts();
      if (result.success) {
        setCounts({ pending: result.pending ?? 0, processed: result.processed ?? 0 });
      }
    } catch (e) {
      console.error("获取数量失败:", e);
    }
  }, [schoolId]);

  const fetchComments = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const result = await getAuditComments(statusFilter, currentPage, 10);
      if (result.success) {
        setComments(result.data || []);
        setPagination(result.pagination || null);
      } else {
        toast.error(result.error || "获取留言审核列表失败");
      }
    } catch (error) {
      console.error("获取留言审核列表失败:", error);
      toast.error("获取留言审核列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, searchParams, statusFilter]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const refreshAfterAction = useCallback(() => {
    fetchComments();
    fetchCounts();
  }, [fetchComments, fetchCounts]);

  const handleRestore = async (id: string): Promise<boolean> => {
    if (processingId) return false;
    setProcessingId(id);
    try {
      const result = await reviewComment(id, "RESTORE");
      if (!result.success) throw new Error(result.error || "恢复失败");
      toast.success("留言已恢复显示");
      refreshAfterAction();
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const handleHide = async (id: string): Promise<boolean> => {
    if (processingId) return false;
    setProcessingId(id);
    try {
      const result = await reviewComment(id, "HIDE");
      if (!result.success) throw new Error(result.error || "隐藏失败");
      toast.success("留言已隐藏");
      refreshAfterAction();
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "隐藏失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    if (processingId) return false;
    if (!confirm("确定要彻底删除此留言吗？此操作不可恢复。")) return false;
    setProcessingId(id);
    try {
      const result = await hardDeleteComment(id);
      if (!result.success) throw new Error(result.error || "删除失败");
      toast.success("留言已永久删除");
      refreshAfterAction();
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkDelete = async (ids: string[]): Promise<boolean> => {
    if (processingId || ids.length === 0) return false;
    if (!confirm(`确定要彻底删除这 ${ids.length} 条留言吗？此操作不可恢复。`)) return false;
    setProcessingId("bulk");
    try {
      const result = await hardDeleteComments(ids);
      if (!result.success) throw new Error(result.error || "批量删除失败");
      toast.success(`已永久删除 ${result.deleted ?? ids.length} 条留言`);
      setSelectedIds(new Set());
      refreshAfterAction();
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const switchTab = (status: "pending" | "processed") => {
    router.push(`/admin/audit/comments?status=${status}&page=1`);
  };

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-4 md:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-[#1A1A1B]">留言审核</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              审核被举报的留言，执行恢复/隐藏/删除操作
            </p>
          </div>

          <Tabs value={statusFilter} onValueChange={(v) => switchTab(v as "pending" | "processed")}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending" className="gap-2">
                待处理
                {counts.pending > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    {counts.pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="processed" className="gap-2">
                已处理
                {counts.processed > 0 && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {counts.processed}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-0">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-[#1A1A1B]">暂无待审核留言</h3>
                  <p className="text-center text-sm text-[#7C7C7C]">
                    当前没有被举报的留言，所有任务已完成
                  </p>
                </div>
              ) : (
                <PendingList
                  comments={comments}
                  expandedIds={expandedIds}
                  processingId={processingId}
                  canPermanentDelete={canPermanentDeleteInPending}
                  onToggleExpand={toggleExpand}
                  onRestore={handleRestore}
                  onHide={handleHide}
                  onDelete={handleDelete}
                  onViewDetail={setDetailComment}
                />
              )}
            </TabsContent>

            <TabsContent value="processed" className="mt-0">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                    <CheckCircle2 className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-[#1A1A1B]">暂无已处理记录</h3>
                  <p className="text-center text-sm text-[#7C7C7C]">
                    尚未处理过任何留言
                  </p>
                </div>
              ) : (
                <ProcessedTable
                  comments={comments}
                  processingId={processingId}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  onDelete={handleDelete}
                  onBulkDelete={handleBulkDelete}
                  onViewDetail={setDetailComment}
                />
              )}
            </TabsContent>
          </Tabs>

          {pagination && pagination.total > 0 && (
            <div className="mt-6 flex justify-center pb-8">
              <PaginationControls
                total={pagination.total}
                pageCount={pagination.pageCount}
                currentPage={pagination.currentPage}
              />
            </div>
          )}

          {detailComment && (
            <DetailModal
              comment={detailComment}
              processingId={processingId}
              onClose={() => setDetailComment(null)}
              onRestore={handleRestore}
              onDelete={handleDelete}
            />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

function PendingList({
  comments,
  expandedIds,
  processingId,
  canPermanentDelete,
  onToggleExpand,
  onRestore,
  onHide,
  onDelete,
  onViewDetail,
}: {
  comments: CommentForAudit[];
  expandedIds: Set<string>;
  processingId: string | null;
  canPermanentDelete: boolean;
  onToggleExpand: (id: string) => void;
  onRestore: (id: string) => Promise<boolean>;
  onHide: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onViewDetail: (c: CommentForAudit) => void;
}) {
  return (
    <div className="divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white">
      {comments.map((c) => {
        const isExpanded = expandedIds.has(c.id);
        const shouldTruncate = c.content.length > 150;
        const displayContent = shouldTruncate && !isExpanded ? c.content.slice(0, 150) + "..." : c.content;
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onViewDetail(c)}
            onKeyDown={(e) => e.key === "Enter" && onViewDetail(c)}
            className="cursor-pointer px-4 py-3 transition-colors hover:bg-[#F6F7F8]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-[#7C7C7C]" />
                  <span className="text-sm font-semibold text-[#1A1A1B]">{c.poi.name}</span>
                  <span className="rounded border border-[#EDEFF1] bg-white px-2 py-0.5 text-xs text-[#7C7C7C]">
                    {c.poi.category}
                  </span>
                  <span className="rounded px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700">
                    ⚠️ 被举报 {c.reportCount} 次
                  </span>
                  {c.isHidden && (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">已隐藏</span>
                  )}
                </div>
                <div className={`text-sm whitespace-pre-line break-words ${c.isHidden ? "italic text-[#7C7C7C]" : "text-[#1A1A1B]"}`}>
                  {displayContent}
                </div>
                {shouldTruncate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(c.id); }}
                    className="mt-1 text-xs text-[#FF4500] hover:underline"
                  >
                    {isExpanded ? "收起" : "展开全文"}
                  </button>
                )}
                <div className="mt-2 text-xs text-[#7C7C7C]">
                  {c.user.nickname || "匿名用户"} · {new Date(c.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onRestore(c.id)}
                  disabled={processingId === c.id}
                  className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  {processingId === c.id ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-600 border-t-transparent" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">通过</span>
                </button>
                <button
                  onClick={() => onHide(c.id)}
                  disabled={processingId === c.id}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {processingId === c.id ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" /> : <EyeOff className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">隐藏</span>
                </button>
                {canPermanentDelete && (
                  <button
                    onClick={() => onDelete(c.id)}
                    disabled={processingId === c.id}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {processingId === c.id ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /> : <Trash2 className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">彻底删除</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProcessedTable({
  comments,
  processingId,
  selectedIds,
  onSelectedIdsChange,
  onDelete,
  onBulkDelete,
  onViewDetail,
}: {
  comments: CommentForAudit[];
  processingId: string | null;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onDelete: (id: string) => Promise<boolean>;
  onBulkDelete: (ids: string[]) => Promise<boolean>;
  onViewDetail: (c: CommentForAudit) => void;
}) {
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onSelectedIdsChange(new Set(comments.map((c) => c.id)));
    } else {
      onSelectedIdsChange(new Set());
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-3">
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2">
          <span className="text-sm font-medium text-red-800">已选择 {selectedCount} 条</span>
          <button
            onClick={() => onBulkDelete(Array.from(selectedIds))}
            disabled={!!processingId}
            className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-50"
          >
            {processingId === "bulk" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            批量彻底删除
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-[#EDEFF1] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={comments.length > 0 && selectedIds.size === comments.length}
                  onChange={toggleSelectAll}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </TableHead>
              <TableHead>留言内容</TableHead>
              <TableHead>最终状态</TableHead>
              <TableHead>审核人 / 时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comments.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => onViewDetail(c)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => {}}
                    onClick={(e) => toggleSelect(c.id, e as unknown as React.MouseEvent)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </TableCell>
                <TableCell className="max-w-[300px]">
                <div className={`truncate text-sm ${c.isHidden ? "italic text-[#7C7C7C]" : "text-[#1A1A1B]"}`} title={c.content}>
                  {c.content.slice(0, 80)}{c.content.length > 80 ? "…" : ""}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#7C7C7C]">
                  <MapPin className="h-3 w-3" />
                  {c.poi.name} · {c.user.nickname || "匿名"}
                </div>
              </TableCell>
              <TableCell>
                {c.isHidden ? (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">已隐藏</span>
                ) : (
                  <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">可见</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-[#7C7C7C]">
                {c.reviewer ? (c.reviewer.nickname || c.reviewer.email || "—") : "—"}
                {c.reviewedAt && (
                  <span className="ml-1 block text-[#7C7C7C]">
                    {new Date(c.reviewedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onDelete(c.id)}
                  disabled={processingId === c.id}
                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {processingId === c.id ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /> : <Trash2 className="h-3 w-3" />}
                  彻底删除
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DetailModal({
  comment,
  processingId,
  onClose,
  onRestore,
  onDelete,
}: {
  comment: CommentForAudit;
  processingId: string | null;
  onClose: () => void;
  onRestore: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  return (
    <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50" onClick={onClose}>
      <div className="modal-container max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#EDEFF1] px-6 py-4">
          <h3 className="text-lg font-semibold text-[#1A1A1B]">留言详情</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#7C7C7C] hover:bg-[#F6F7F8] hover:text-[#1A1A1B]" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-4">
          <div>
            <p className="mb-1 text-xs font-medium text-[#7C7C7C]">留言内容</p>
            <div className={`rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-3 text-sm whitespace-pre-line break-words ${comment.isHidden ? "italic text-[#7C7C7C]" : "text-[#1A1A1B]"}`}>
              {comment.content}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-[#7C7C7C]">作者</p>
            <p className="text-sm text-[#1A1A1B]">
              {comment.user.nickname || "匿名用户"}
              {comment.user.email && <span className="ml-2 text-[#7C7C7C]">({comment.user.email})</span>}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-[#7C7C7C]">关联地点</p>
            <p className="flex items-center gap-1.5 text-sm text-[#1A1A1B]">
              <MapPin className="h-4 w-4 text-[#7C7C7C]" />
              {comment.poi.name}
              <span className="rounded border border-[#EDEFF1] px-2 py-0.5 text-xs text-[#7C7C7C]">{comment.poi.category}</span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-[#7C7C7C]">举报次数</p>
            <p className="text-sm font-semibold text-[#1A1A1B]">{comment.reportCount} 次</p>
            {comment.isHidden && <span className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">已隐藏</span>}
          </div>
          {comment.reviewedAt && (
            <div>
              <p className="mb-1 text-xs font-medium text-[#7C7C7C]">审核信息</p>
              <p className="text-sm text-[#1A1A1B]">
                {comment.reviewer?.nickname || comment.reviewer?.email || "—"} · {new Date(comment.reviewedAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-medium text-[#7C7C7C]">发布时间</p>
            <p className="text-sm text-[#1A1A1B]">
              {new Date(comment.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#7C7C7C] hover:bg-[#F6F7F8]">关闭</button>
          <button
            onClick={async () => { const ok = await onRestore(comment.id); if (ok) onClose(); }}
            disabled={processingId === comment.id}
            className="flex items-center justify-center gap-2 flex-1 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            {processingId === comment.id ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" /> : <CheckCircle2 className="h-4 w-4" />}
            通过
          </button>
          <button
            onClick={async () => { const ok = await onDelete(comment.id); if (ok) onClose(); }}
            disabled={processingId === comment.id}
            className="flex items-center justify-center gap-2 flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {processingId === comment.id ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /> : <Trash2 className="h-4 w-4" />}
            彻底删除
          </button>
        </div>
      </div>
    </div>
  );
}
