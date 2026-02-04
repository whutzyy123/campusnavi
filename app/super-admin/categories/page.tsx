"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState } from "@/components/empty-state";
import { Tags, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 超级管理员全局分类管理页面
 */
export default function GlobalCategoryManagementPage() {
  const { currentUser } = useAuthStore();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 加载全局分类列表
  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const currentPage = parseInt(searchParams.get("page") || "1", 10);
        const response = await fetch(`/api/admin/global-categories?page=${currentPage}&limit=10`);
        const data = await response.json();
        if (data.success) {
          setCategories(data.data || []);
          setPagination(data.pagination || null);
        } else {
          toast.error(data.message || "获取全局分类列表失败");
        }
      } catch (error) {
        console.error("获取全局分类列表失败:", error);
        toast.error("获取全局分类列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, [searchParams]);

  // 创建新全局分类
  const handleCreate = async () => {
    if (!newCategoryName.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/admin/global-categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "创建失败");
      }

      toast.success("全局分类创建成功");
      setNewCategoryName("");
      // 重新加载列表（保持当前页）
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const refreshResponse = await fetch(`/api/admin/global-categories?page=${currentPage}&limit=10`);
      const refreshData = await refreshResponse.json();
      if (refreshData.success) {
        setCategories(refreshData.data || []);
        setPagination(refreshData.pagination || null);
      }
    } catch (error) {
      console.error("创建全局分类失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败，请重试");
    } finally {
      setIsCreating(false);
    }
  };

  // 删除全局分类
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除全局分类"${name}"吗？此操作将影响所有学校，且不可恢复。`)) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/global-categories/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "删除失败");
      }

      toast.success("全局分类已删除");
      // 重新加载列表（保持当前页）
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const refreshResponse = await fetch(`/api/admin/global-categories?page=${currentPage}&limit=10`);
      const refreshData = await refreshResponse.json();
      if (refreshData.success) {
        setCategories(refreshData.data || []);
        setPagination(refreshData.pagination || null);
      }
    } catch (error) {
      console.error("删除全局分类失败:", error);
      toast.error(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-4 md:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-[#1A1A1B]">全局分类管理</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              管理全平台默认分类，所有学校将默认使用这些分类
            </p>
          </div>

          {/* 新增分类区域 - 粘性布局，滚动时保持可见 */}
          <div className="sticky top-0 z-10 mb-6 rounded-lg border border-[#EDEFF1] bg-white/95 backdrop-blur-sm p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) {
                    handleCreate();
                  }
                }}
                placeholder="输入全局分类名称（如：食堂、教学楼、快递点）"
                maxLength={50}
                className="flex-1 rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#0079D3] focus:outline-none focus:ring-2 focus:ring-[#0079D3]/20"
                disabled={isCreating}
              />
              <button
                onClick={handleCreate}
                disabled={isCreating || !newCategoryName.trim()}
                className="flex items-center gap-2 rounded-full bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>新增全局分类</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 分类列表 - 固定高度区域 */}
          <div className="min-h-[500px] flex flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent"></div>
              </div>
            ) : categories.length === 0 ? (
              <EmptyState
                icon={Tags}
                title="暂无全局分类"
                description="创建第一个全局分类以作为所有学校的默认分类"
              />
            ) : (
              <>
                <div className="flex-1 divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white overflow-y-auto">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="px-4 py-3 transition-colors hover:bg-[#F6F7F8] h-16 flex items-center"
                    >
                      <div className="flex items-center justify-between gap-4 w-full">
                        {/* 左侧：分类信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Tags className="h-4 w-4 text-[#7C7C7C] flex-shrink-0" />
                            <span className="text-sm font-semibold text-[#1A1A1B] truncate">
                              {category.name}
                            </span>
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              系统默认
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[#7C7C7C] ml-6">
                            <span>全平台 POI: {category.poiCount} 个</span>
                          </div>
                        </div>

                        {/* 右侧：删除按钮 */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleDelete(category.id, category.name)}
                            disabled={deletingId === category.id || category.poiCount > 0}
                            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              category.poiCount > 0
                                ? "该分类下仍有 POI，无法删除"
                                : "删除全局分类"
                            }
                          >
                            {deletingId === category.id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">删除</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
              </>
            )}
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

