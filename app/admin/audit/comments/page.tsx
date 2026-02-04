"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState } from "@/components/empty-state";
import { AlertTriangle, RotateCcw, Trash2, CheckCircle2, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";

interface CommentForAudit {
  id: string;
  content: string;
  createdAt: string;
  reportCount: number;
  isHidden: boolean;
  user: {
    id: string;
    nickname: string | null;
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
 * 功能：查看被举报或已隐藏的留言，执行恢复/删除操作
 */
export default function CommentAuditPage() {
  const { currentUser } = useAuthStore();
  const searchParams = useSearchParams();
  const [comments, setComments] = useState<CommentForAudit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const schoolId = currentUser?.schoolId;

  // 加载需要审核的留言
  useEffect(() => {
    const fetchComments = async () => {
      if (!schoolId) return;

      setIsLoading(true);
      try {
        const currentPage = parseInt(searchParams.get("page") || "1", 10);
        const response = await fetch(`/api/admin/comments?page=${currentPage}&limit=10`);
        const data = await response.json();
        if (data.success) {
          setComments(data.data || []);
          setPagination(data.pagination || null);
        } else {
          toast.error(data.message || "获取留言审核列表失败");
        }
      } catch (error) {
        console.error("获取留言审核列表失败:", error);
        toast.error("获取留言审核列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchComments();
  }, [schoolId, searchParams]);

  const handleRestore = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);

    try {
      const response = await fetch(`/api/admin/comments/${id}/restore`, {
        method: "PATCH",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "恢复失败");
      }
      toast.success("留言已恢复显示");
      // 重新加载列表（保持当前页）
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const refreshResponse = await fetch(`/api/admin/comments?page=${currentPage}&limit=10`);
      const refreshData = await refreshResponse.json();
      if (refreshData.success) {
        setComments(refreshData.data || []);
        setPagination(refreshData.pagination || null);
      }
    } catch (error) {
      console.error("恢复留言失败:", error);
      toast.error(error instanceof Error ? error.message : "恢复失败，请重试");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (processingId) return;
    if (!confirm("确定要永久删除该留言吗？此操作不可恢复。")) {
      return;
    }

    setProcessingId(id);
    try {
      const response = await fetch(`/api/comments/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "删除失败");
      }
      toast.success("留言已删除");
      // 重新加载列表（保持当前页）
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const refreshResponse = await fetch(`/api/admin/comments?page=${currentPage}&limit=10`);
      const refreshData = await refreshResponse.json();
      if (refreshData.success) {
        setComments(refreshData.data || []);
        setPagination(refreshData.pagination || null);
      }
    } catch (error) {
      console.error("删除留言失败:", error);
      toast.error(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setProcessingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-4 md:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-[#1A1A1B]">留言审核</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              审核被举报的留言，执行恢复/删除操作
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent"></div>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F6F7F8]">
                <CheckCircle2 className="h-8 w-8 text-[#52c41a]" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[#1A1A1B]">All caught up!</h3>
              <p className="text-center text-sm text-[#7C7C7C]">
                当前没有被举报的留言，所有任务已完成
              </p>
            </div>
          ) : (
            <div className="min-h-[500px] flex flex-col">
              <div className="flex-1 divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white overflow-y-auto">
                {comments.map((c) => {
                const isExpanded = expandedIds.has(c.id);
                const contentLines = c.content.split("\n");
                const shouldTruncate = contentLines.length > 3 || c.content.length > 150;
                const displayContent = shouldTruncate && !isExpanded
                  ? c.content.slice(0, 150) + "..."
                  : c.content;

                return (
                  <div
                    key={c.id}
                    className="px-4 py-3 transition-colors hover:bg-[#F6F7F8]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* 左侧：主要内容 */}
                      <div className="flex-1 min-w-0">
                        {/* 顶部：POI 名称和标签 */}
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-[#7C7C7C]" />
                            <span className="text-sm font-semibold text-[#1A1A1B]">
                              {c.poi.name}
                            </span>
                          </div>
                          <span className="rounded border border-[#EDEFF1] bg-white px-2 py-0.5 text-xs font-medium text-[#7C7C7C]">
                            {c.poi.category}
                          </span>
                          {/* 突出显示被举报次数 - 这是审核的核心信息 */}
                          <span className={`rounded px-2.5 py-1 text-xs font-semibold ${
                            c.reportCount >= 3
                              ? "bg-red-100 text-red-700" // 严重：3次及以上
                              : c.reportCount >= 2
                              ? "bg-orange-100 text-orange-700" // 中等：2次
                              : "bg-[#FFE5DD] text-[#FF4500]" // 轻微：1次
                          }`}>
                            ⚠️ 被举报 {c.reportCount} 次
                          </span>
                          {c.isHidden && (
                            <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              已隐藏
                            </span>
                          )}
                        </div>

                        {/* 留言内容 */}
                        <div
                          className={`text-sm text-[#1A1A1B] whitespace-pre-line break-words ${
                            c.isHidden ? "italic text-[#7C7C7C]" : ""
                          }`}
                        >
                          {displayContent}
                        </div>
                        {shouldTruncate && (
                          <button
                            onClick={() => toggleExpand(c.id)}
                            className="mt-1 text-xs text-[#0079D3] hover:underline"
                          >
                            {isExpanded ? "收起" : "展开全文"}
                          </button>
                        )}

                        {/* 底部：作者和时间 */}
                        <div className="mt-2 flex items-center gap-3 text-xs text-[#7C7C7C]">
                          <span className="font-medium">
                            {c.user.nickname || "匿名用户"}
                          </span>
                          <span>·</span>
                          <span>
                            {new Date(c.createdAt).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* 右侧：操作按钮 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRestore(c.id)}
                          disabled={processingId === c.id}
                          className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="通过/恢复"
                        >
                          {processingId === c.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-600 border-t-transparent"></div>
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">通过</span>
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={processingId === c.id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="删除"
                        >
                          {processingId === c.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">删除</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
              {/* 分页控件 */}
              {pagination && pagination.total > 0 && (
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
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}


