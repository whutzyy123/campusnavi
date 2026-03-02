"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState } from "@/components/empty-state";
import { Tags, Plus, Trash2, AlertCircle, EyeOff, Edit2, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { updateCategory } from "@/lib/category-actions";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  isGlobal: boolean;
  isHidden: boolean;
  customName: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 分类管理页面
 * 功能：创建、查看、删除 POI 分类
 */
export default function CategoryManagementPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CategoryManagementPageContent />
    </Suspense>
  );
}

function CategoryManagementPageContent() {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");

  const schoolId = currentUser?.schoolId;

  // 刷新列表的辅助函数
  const refreshCategories = async () => {
    if (!schoolId) return;
    const currentPage = parseInt(searchParams.get("page") || "1", 10);
    const response = await fetch(`/api/admin/categories?page=${currentPage}&limit=10`);
    const data = await response.json();
    if (data.success) {
      setCategories(data.data || []);
      setPagination(data.pagination || null);
    }
  };

  // 加载分类列表
  useEffect(() => {
    const fetchCategories = async () => {
      if (!schoolId) return;

      setIsLoading(true);
      try {
        const currentPage = parseInt(searchParams.get("page") || "1", 10);
        const response = await fetch(`/api/admin/categories?page=${currentPage}&limit=10`);
        const data = await response.json();
        if (data.success) {
          setCategories(data.data || []);
          setPagination(data.pagination || null);
        } else {
          toast.error(data.message || "获取分类列表失败");
        }
      } catch (error) {
        console.error("获取分类列表失败:", error);
        toast.error("获取分类列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, [schoolId, searchParams]);

  // 创建新分类（始终创建校内分类，schoolId 由后端从 Cookie 注入）
  const handleCreate = async () => {
    if (!newCategoryName.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          isGlobal: false, // 明确创建校内分类
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "创建失败");
      }

      toast.success("分类创建成功");
      setNewCategoryName("");
      await refreshCategories();
    } catch (error) {
      console.error("创建分类失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败，请重试");
    } finally {
      setIsCreating(false);
    }
  };

  // 删除分类（系统分类隐藏，校内分类物理删除）
  const handleDelete = async (
    id: string,
    name: string,
    isGlobal: boolean,
    poiCount: number
  ) => {
    if (!isGlobal && poiCount > 0) {
      toast.error("删除前请先将关联的 POI 重新分配其他分类");
      return;
    }
    if (isGlobal && poiCount > 0) {
      toast.error("隐藏前请先处理关联的 POI");
      return;
    }

    const message = isGlobal
      ? `确定要在当前学校隐藏全局分类"${name}"吗？`
      : `确定要删除分类"${name}"吗？此操作不可恢复。`;

    if (!confirm(message)) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/categories/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "操作失败");
      }

      toast.success(data.message || "操作成功");
      await refreshCategories();
    } catch (error) {
      console.error("操作失败:", error);
      toast.error(error instanceof Error ? error.message : "操作失败，请重试");
    } finally {
      setDeletingId(null);
    }
  };

  // 隐藏全局分类
  const handleHide = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/categories/${id}/override`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isHidden: true }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "隐藏失败");
      }

      toast.success("全局分类已在该学校隐藏");
      await refreshCategories();
    } catch (error) {
      console.error("隐藏分类失败:", error);
      toast.error(error instanceof Error ? error.message : "隐藏失败，请重试");
    } finally {
      setDeletingId(null);
    }
  };

  // 开始编辑自定义名称
  const handleStartEdit = (category: Category) => {
    setEditingId(category.id);
    setCustomName(category.customName || category.name);
  };

  // 保存名称（校内分类更新 base 名称，仅校内分类可编辑）
  const handleSaveCustomName = async (id: string) => {
    setEditingId(id);
    try {
      const result = await updateCategory(id, { name: customName.trim() });
      if (!result.success) throw new Error(result.error || "保存失败");
      toast.success("分类名称已更新");
      setEditingId(null);
      setCustomName("");
      await refreshCategories();
    } catch (error) {
      console.error("保存失败:", error);
      toast.error(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setEditingId(null);
    }
  };

  // 恢复默认显示
  const handleRestore = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/categories/${id}/override`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "恢复失败");
      }

      toast.success("已恢复为默认显示");
      await refreshCategories();
    } catch (error) {
      console.error("恢复失败:", error);
      toast.error(error instanceof Error ? error.message : "恢复失败，请重试");
    }
  };

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-4 lg:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-[#1A1A1B]">分类管理</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              管理 POI 分类，创建自定义分类以便更好地组织 POI
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
                placeholder="输入分类名称（如：食堂、教学楼、快递点）"
                maxLength={50}
                className="flex-1 rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
                    <span>新增分类</span>
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
                title="暂无分类"
                description="创建第一个分类以开始组织您的 POI"
              />
            ) : (
              <>
                <div className="flex-1 divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white overflow-y-auto">
                  {categories.map((category) => {
                const isEditing = editingId === category.id;
                const displayName = category.customName || category.name;

                return (
                  <div
                    key={category.id}
                    className="px-4 py-3 transition-colors hover:bg-[#F6F7F8]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* 左侧：分类信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Tags className="h-4 w-4 text-[#7C7C7C] flex-shrink-0" />
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <input
                                type="text"
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSaveCustomName(category.id);
                                  } else if (e.key === "Escape") {
                                    setEditingId(null);
                                    setCustomName("");
                                  }
                                }}
                                className="flex-1 rounded border border-[#EDEFF1] bg-white px-2 py-1 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveCustomName(category.id)}
                                className="rounded px-2 py-1 text-xs text-[#FF4500] hover:bg-[#FFE5DD]"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setCustomName("");
                                }}
                                className="rounded px-2 py-1 text-xs text-[#7C7C7C] hover:bg-[#F6F7F8]"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-semibold text-[#1A1A1B] truncate">
                                {displayName}
                              </span>
                              {category.isGlobal && (
                                <span className="rounded-md bg-[#FFE5DD] px-2.5 py-1 text-xs font-semibold text-[#FF4500] ring-1 ring-[#FF4500]/20">
                                  系统默认
                                </span>
                              )}
                              {!category.isGlobal && (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  校内独特
                                </span>
                              )}
                              {category.customName && (
                                <span className="text-xs text-[#7C7C7C]">
                                  (原: {category.name})
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#7C7C7C] ml-6">
                          <span>关联 POI: {category.poiCount} 个</span>
                          {category.poiCount > 0 && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <AlertCircle className="h-3 w-3" />
                              {category.isGlobal ? "隐藏前需先处理关联的 POI" : "删除前需先处理关联的 POI"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 右侧：操作按钮 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* 系统分类：仅保留恢复（有自定义名时）和隐藏，不显示修改名称 */}
                        {category.isGlobal && !isEditing && (
                          <>
                            {category.customName && (
                              <button
                                onClick={() => handleRestore(category.id)}
                                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                                title="恢复默认名称"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">恢复</span>
                              </button>
                            )}
                          </>
                        )}
                        {/* 校内分类：显示修改名称 */}
                        {!category.isGlobal && !isEditing && (
                          <button
                            onClick={() => handleStartEdit(category)}
                            className="flex items-center gap-1.5 rounded-lg border border-[#FF4500]/40 bg-[#FFE5DD] px-3 py-1.5 text-xs font-medium text-[#FF4500] transition-colors hover:bg-[#FFE5DD]/80"
                            title="修改名称"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">修改名称</span>
                          </button>
                        )}
                        <button
                          onClick={() =>
                            handleDelete(
                              category.id,
                              displayName,
                              category.isGlobal,
                              category.poiCount
                            )
                          }
                          disabled={deletingId === category.id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            category.poiCount > 0
                              ? `该分类下仍有 POI，无法${category.isGlobal ? "隐藏" : "删除"}`
                              : category.isGlobal
                              ? "隐藏全局分类"
                              : "删除分类"
                          }
                        >
                          {deletingId === category.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                          ) : category.isGlobal ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">隐藏</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">删除</span>
                            </>
                          )}
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
              </>
            )}
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

