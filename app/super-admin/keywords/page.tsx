"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { Badge } from "@/components/badge";
import { useAuthStore } from "@/store/use-auth-store";
import { Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";

interface SensitiveWord {
  id: string;
  keyword: string;
  createdAt: string;
  addedBy: {
    id: string;
    nickname: string;
  };
}

export default function KeywordsManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [keywords, setKeywords] = useState<SensitiveWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 获取屏蔽词列表
  const fetchKeywords = async () => {
    try {
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const response = await fetch(`/api/keywords?page=${currentPage}&limit=10`);
      const data = await response.json();

      if (data.success) {
        setKeywords(data.data || data.keywords || []);
        setPagination(data.pagination || null);
      } else {
        toast.error(data.message || "获取屏蔽词列表失败");
      }
    } catch (error) {
      console.error("获取屏蔽词列表失败:", error);
      toast.error("获取屏蔽词列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
  }, [searchParams]);

  // 添加屏蔽词
  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) {
      toast.error("请输入屏蔽词");
      return;
    }

    if (!currentUser) {
      toast.error("请先登录");
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch("/api/keywords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          addedById: currentUser.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("屏蔽词添加成功");
        setNewKeyword("");
        // 重新加载列表（保持当前页）
        await fetchKeywords();
      } else {
        toast.error(data.message || "添加屏蔽词失败");
      }
    } catch (error) {
      console.error("添加屏蔽词失败:", error);
      toast.error("添加屏蔽词失败");
    } finally {
      setIsAdding(false);
    }
  };

  // 删除屏蔽词
  const handleDeleteKeyword = async (id: string) => {
    if (!confirm("确定要删除这个屏蔽词吗？")) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/keywords/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        toast.success("屏蔽词删除成功");
        // 重新加载列表（保持当前页）
        await fetchKeywords();
      } else {
        toast.error(data.message || "删除屏蔽词失败");
      }
    } catch (error) {
      console.error("删除屏蔽词失败:", error);
      toast.error("删除屏蔽词失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-6">
          <Card className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">平台屏蔽词管理</h1>
              <p className="mt-2 text-sm text-gray-600">
                管理平台级屏蔽词，所有用户提交的内容都会自动检查是否包含这些词汇
              </p>
            </div>

            {/* 添加屏蔽词表单 */}
            <div className="mb-6 flex gap-3">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddKeyword();
                  }
                }}
                placeholder="输入要添加的屏蔽词"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={handleAddKeyword}
                disabled={isAdding || !newKeyword.trim()}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAdding ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    添加中...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    添加
                  </>
                )}
              </button>
            </div>

            {/* 屏蔽词列表 */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              </div>
            ) : keywords.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                <p>暂无屏蔽词</p>
                <p className="mt-2 text-sm">点击上方"添加"按钮添加第一个屏蔽词</p>
              </div>
            ) : (
              <div className="min-h-[500px] flex flex-col">
                <div className="flex-1 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>屏蔽词</TableHead>
                        <TableHead>添加人</TableHead>
                        <TableHead>添加时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keywords.map((keyword) => (
                        <TableRow key={keyword.id} className="h-16">
                          <TableCell>
                            <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
                              {keyword.keyword}
                            </code>
                          </TableCell>
                          <TableCell>{keyword.addedBy.nickname}</TableCell>
                          <TableCell>
                            {new Date(keyword.createdAt).toLocaleDateString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              onClick={() => handleDeleteKeyword(keyword.id)}
                              disabled={deletingId === keyword.id}
                              className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingId === keyword.id ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                                  删除中...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4" />
                                  删除
                                </>
                              )}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* 分页控件 */}
                {!loading && pagination && pagination.total > 0 && (
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
      </AdminLayout>
    </AuthGuard>
  );
}

