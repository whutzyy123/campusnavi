"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { StatusBadge } from "@/components/status-badge";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { EmptyState } from "@/components/empty-state";
import { formatDateTimeShort } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import {
  getSchoolComments,
  getSchoolCommentDetail,
  reviewComment,
  hardDeleteComment,
} from "@/lib/comment-actions";
import { useDebounce } from "@/hooks/use-debounce";
import toast from "react-hot-toast";
import Image from "next/image";
import Link from "next/link";
import {
  Info,
  EyeOff,
  CheckCircle2,
  Trash2,
  X,
  MapPin,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { TableActions } from "@/components/ui/table-actions";

interface SchoolCommentItem {
  id: string;
  content: string;
  createdAt: string;
  isHidden: boolean;
  isReviewed: boolean;
  reportCount: number;
  likeCount: number;
  parentId: string | null;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    email: string | null;
  };
  poi: {
    id: string;
    name: string;
    category: string | null;
  };
}

interface SchoolCommentDetailItem extends SchoolCommentItem {
  parent?: {
    id: string;
    content: string;
    createdAt: string;
    isHidden: boolean;
    user: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  } | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "visible", label: "可见" },
  { value: "hidden", label: "已隐藏" },
];

const CONTENT_MAX_LENGTH = 60;

export default function SchoolCommentsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SchoolCommentsPageContent />
    </Suspense>
  );
}

function SchoolCommentsPageContent() {
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [comments, setComments] = useState<SchoolCommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
    limit: number;
  } | null>(null);

  const urlSearch = searchParams.get("search") || "";
  const statusFilter = searchParams.get("status") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebounce(searchInput, 400);
  const [detailComment, setDetailComment] = useState<SchoolCommentDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (debouncedSearch !== urlSearch) {
      const params = new URLSearchParams(searchParams.toString());
      if (debouncedSearch) params.set("search", debouncedSearch);
      else params.delete("search");
      params.delete("page");
      router.replace(`/admin/school/comments?${params.toString()}`);
    }
  }, [debouncedSearch, urlSearch, searchParams, router]);

  const fetchComments = useCallback(async () => {
    if (!currentUser?.schoolId) return;
    setIsLoading(true);
    try {
      const result = await getSchoolComments({
        search: debouncedSearch.trim() || null,
        status: statusFilter === "visible" ? "visible" : statusFilter === "hidden" ? "hidden" : null,
        page: currentPage,
        limit: 20,
      });
      if (result.success) {
        setComments(result.data || []);
        setPagination(result.pagination || null);
      } else {
        toast.error(result.error || "获取留言列表失败");
      }
    } catch (error) {
      console.error("获取留言列表失败:", error);
      toast.error("获取留言列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.schoolId, debouncedSearch, statusFilter, currentPage]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const openDetail = useCallback(async (c: SchoolCommentItem) => {
    setDetailComment(null);
    setDetailLoading(true);
    try {
      const result = await getSchoolCommentDetail(c.id);
      if (result.success && result.data) {
        setDetailComment(result.data);
      } else {
        toast.error(result.error || "获取留言详情失败");
      }
    } catch (e) {
      toast.error("获取留言详情失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshAfterAction = useCallback(() => {
    fetchComments();
    router.refresh();
  }, [fetchComments, router]);

  const handleHide = useCallback(async (id: string): Promise<boolean> => {
    if (processingId) return false;
    setProcessingId(id);
    try {
      const result = await reviewComment(id, "HIDE");
      if (!result.success) throw new Error(result.error || "隐藏失败");
      toast.success("留言已隐藏");
      refreshAfterAction();
      if (detailComment?.id === id) {
        setDetailComment((prev) => (prev ? { ...prev, isHidden: true } : null));
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "隐藏失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  }, [processingId, detailComment?.id, refreshAfterAction]);

  const handleRestore = useCallback(async (id: string): Promise<boolean> => {
    if (processingId) return false;
    setProcessingId(id);
    try {
      const result = await reviewComment(id, "RESTORE");
      if (!result.success) throw new Error(result.error || "恢复失败");
      toast.success("留言已恢复显示");
      refreshAfterAction();
      if (detailComment?.id === id) {
        setDetailComment((prev) => (prev ? { ...prev, isHidden: false } : null));
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  }, [processingId, detailComment?.id, refreshAfterAction]);

  const handleDelete = useCallback(async (id: string): Promise<boolean> => {
    if (processingId) return false;
    if (!confirm("确定要彻底删除此留言吗？此操作不可恢复。")) return false;
    setProcessingId(id);
    try {
      const result = await hardDeleteComment(id);
      if (!result.success) throw new Error(result.error || "删除失败");
      toast.success("留言已永久删除");
      if (detailComment?.id === id) setDetailComment(null);
      refreshAfterAction();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败，请重试");
      return false;
    } finally {
      setProcessingId(null);
    }
  }, [processingId, detailComment?.id, refreshAfterAction]);

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === "" || (key === "page" && value === "1")) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.push(`/admin/school/comments?${params.toString()}`);
  };

  const handleStatusChange = (value: string) => {
    updateParams({ status: value, page: "1", search: searchInput });
  };

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-4 lg:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-[#1A1A1B]">留言管理</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              查看和管理本校全部留言，支持按 POI 名称、用户昵称搜索及状态筛选
            </p>
          </div>

          {/* 筛选栏 */}
          <div className="mb-4">
            <AdminFilterBar
              search={{
                value: searchInput,
                onChange: setSearchInput,
                placeholder: "搜索 POI 名称或用户昵称",
              }}
              filters={[
                {
                  label: "状态",
                  value: statusFilter,
                  onChange: (v) => handleStatusChange(v),
                  options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                },
              ]}
            />
          </div>

          {/* 数据表格 */}
          <div className="min-w-0 overflow-x-auto rounded-lg border border-[#EDEFF1] bg-white">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
              </div>
            ) : comments.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="暂无留言数据"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead responsiveHide="sm">用户</TableHead>
                    <TableHead responsiveHide="sm">POI</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead responsiveHide="sm">统计</TableHead>
                    <TableHead responsiveHide="lg">时间</TableHead>
                    <TableHead responsiveHide="sm">状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comments.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-[#F6F7F8]"
                      onClick={() => openDetail(c)}
                    >
                      <TableCell responsiveHide="sm">
                        <div className="flex items-center gap-2">
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#EDEFF1]">
                            {c.user.avatar ? (
                              <Image
                                src={c.user.avatar}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="32px"
                                unoptimized={c.user.avatar.startsWith("blob:")}
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs font-medium text-[#7C7C7C]">
                                {(c.user.nickname || "?")[0]}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-[#1A1A1B] truncate max-w-[120px]">
                            {c.user.nickname || "匿名用户"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell responsiveHide="sm">
                        <span className="text-sm text-[#1A1A1B]">{c.poi.name}</span>
                      </TableCell>
                      <TableCell className="max-w-[220px] min-w-[140px]">
                        <span
                          className="block truncate text-sm text-[#1A1A1B]"
                          title={c.content}
                        >
                          {c.content.length > CONTENT_MAX_LENGTH
                            ? c.content.slice(0, CONTENT_MAX_LENGTH) + "…"
                            : c.content}
                        </span>
                      </TableCell>
                      <TableCell responsiveHide="sm">
                        <div className="flex items-center gap-3 text-xs text-[#7C7C7C]">
                          <span>举报 {c.reportCount}</span>
                          <span>点赞 {c.likeCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-[#7C7C7C]" responsiveHide="lg">
                        {formatDateTimeShort(c.createdAt)}
                      </TableCell>
                      <TableCell responsiveHide="sm">
                        <StatusBadge domain="comment" status={c.isHidden ? "hidden" : "visible"} />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TableActions
                          disabled={processingId === c.id}
                          items={[
                            { label: "查看详情", icon: Info, onClick: () => openDetail(c) },
                            "separator",
                            c.isHidden
                              ? {
                                  label: "恢复",
                                  icon: CheckCircle2,
                                  onClick: () => handleRestore(c.id),
                                }
                              : {
                                  label: "隐藏",
                                  icon: EyeOff,
                                  onClick: () => handleHide(c.id),
                                },
                            "separator",
                            {
                              label: "彻底删除",
                              icon: Trash2,
                              onClick: () => handleDelete(c.id),
                              variant: "destructive",
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {pagination && pagination.total > 0 && (
            <div className="mt-6 flex justify-center pb-8">
              <PaginationControls
                total={pagination.total}
                pageCount={pagination.pageCount}
                currentPage={pagination.currentPage}
                limit={pagination.limit}
              />
            </div>
          )}

          <CommentDetailModal
            isOpen={!!detailComment || detailLoading}
            isLoading={detailLoading}
            comment={detailComment}
            processingId={processingId}
            onClose={() => {
              setDetailComment(null);
              setDetailLoading(false);
            }}
            onHide={handleHide}
            onRestore={handleRestore}
            onDelete={handleDelete}
          />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

function CommentDetailModal({
  isOpen,
  isLoading,
  comment,
  processingId,
  onClose,
  onHide,
  onRestore,
  onDelete,
}: {
  isOpen: boolean;
  isLoading: boolean;
  comment: SchoolCommentDetailItem | null;
  processingId: string | null;
  onClose: () => void;
  onHide: (id: string) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      containerClassName="max-w-lg"
    >
      <div className="flex items-center justify-between border-b border-[#EDEFF1] px-6 py-4">
        <h3 className="text-lg font-semibold text-[#1A1A1B]">留言详情</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-[#7C7C7C] hover:bg-[#F6F7F8] hover:text-[#1A1A1B]"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
        </div>
      ) : comment ? (
        <>
          <div className="space-y-4 px-6 py-4">
            {comment.parent && (
              <div>
                <p className="mb-1 text-xs font-medium text-[#7C7C7C]">父留言（被回复内容）</p>
                <div
                  className={`rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-3 text-sm whitespace-pre-line break-words ${
                    comment.parent.isHidden ? "italic text-[#7C7C7C]" : "text-[#1A1A1B]"
                  }`}
                >
                  {comment.parent.content}
                </div>
                <p className="mt-1 text-xs text-[#7C7C7C]">
                  {comment.parent.user.nickname || "匿名用户"} ·{" "}
                  {new Date(comment.parent.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-[#7C7C7C]">留言内容</p>
              <div
                className={`rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-3 text-sm whitespace-pre-line break-words ${
                  comment.isHidden ? "italic text-[#7C7C7C]" : "text-[#1A1A1B]"
                }`}
              >
                {comment.content}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[#7C7C7C]">作者</p>
              <p className="text-sm text-[#1A1A1B]">
                {comment.user.nickname || "匿名用户"}
                {comment.user.email && (
                  <a
                    href={`mailto:${comment.user.email}`}
                    className="ml-2 text-[#7C7C7C] hover:text-[#FF4500] hover:underline"
                  >
                    ({comment.user.email})
                  </a>
                )}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[#7C7C7C]">关联地点</p>
              <p className="flex items-center gap-1.5 text-sm text-[#1A1A1B]">
                <MapPin className="h-4 w-4 shrink-0 text-[#7C7C7C]" />
                <Link
                  href={`/?poiId=${comment.poi.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#FF4500] hover:underline"
                >
                  {comment.poi.name}
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {comment.poi.category && (
                  <span className="rounded border border-[#EDEFF1] px-2 py-0.5 text-xs text-[#7C7C7C]">
                    {comment.poi.category}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[#7C7C7C]">统计</p>
              <p className="text-sm text-[#1A1A1B]">
                举报 {comment.reportCount} 次 · 点赞 {comment.likeCount} 次
              </p>
              {comment.isHidden && (
                <span className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                  已隐藏
                </span>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[#7C7C7C]">发布时间</p>
              <p className="text-sm text-[#1A1A1B]">
                {new Date(comment.createdAt).toLocaleString("zh-CN", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-[#EDEFF1] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-w-[80px] rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#7C7C7C] hover:bg-[#F6F7F8]"
            >
              关闭
            </button>
            {comment.isHidden ? (
              <button
                onClick={async () => {
                  const ok = await onRestore(comment.id);
                  if (ok) onClose();
                }}
                disabled={processingId === comment.id}
                className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {processingId === comment.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                恢复显示
              </button>
            ) : (
              <button
                onClick={async () => {
                  const ok = await onHide(comment.id);
                  if (ok) onClose();
                }}
                disabled={processingId === comment.id}
                className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {processingId === comment.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                下架隐藏
              </button>
            )}
            <button
              onClick={async () => {
                const ok = await onDelete(comment.id);
                if (ok) onClose();
              }}
              disabled={processingId === comment.id}
              className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {processingId === comment.id ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              彻底删除
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
