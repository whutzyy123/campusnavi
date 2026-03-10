"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { AdminPageContainer } from "@/components/admin/admin-page-container";
import { EmptyState } from "@/components/empty-state";
import { Tags, Plus, Trash2, Pencil, Droplets, LayoutGrid } from "lucide-react";
import toast from "react-hot-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  getMicroCategories,
  createMicroCategory,
  updateMicroCategory,
  deleteMicroCategory,
  getGlobalCategories,
  createGlobalCategory,
  deleteGlobalCategory,
  type MicroCategoryItem,
} from "@/lib/category-actions";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

type TabType = "regular" | "micro";

/**
 * 超级管理员分类管理页面
 * 支持常规全局分类与便民公共设施的切换管理
 */
export default function SuperAdminCategoriesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SuperAdminCategoriesPageContent />
    </Suspense>
  );
}

function SuperAdminCategoriesPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("regular");

  // Regular global categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingRegular, setIsLoadingRegular] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [deletingRegularId, setDeletingRegularId] = useState<string | null>(null);

  // Micro categories
  const [microCategories, setMicroCategories] = useState<MicroCategoryItem[]>([]);
  const [isLoadingMicro, setIsLoadingMicro] = useState(false);
  const [deletingMicroId, setDeletingMicroId] = useState<string | null>(null);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalIsMicro, setModalIsMicro] = useState(false);
  const [modalName, setModalName] = useState("");
  const [modalIcon, setModalIcon] = useState("");
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Load regular global categories
  const fetchRegularCategories = useCallback(async () => {
    setIsLoadingRegular(true);
    try {
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const result = await getGlobalCategories({ page: currentPage, limit: 10 });
      if (result.success && result.data) {
        setCategories(result.data);
        setPagination(result.pagination || null);
      } else {
        toast.error(result.error || "获取全局分类列表失败");
      }
    } catch (error) {
      console.error("获取全局分类列表失败:", error);
      toast.error("获取全局分类列表失败");
    } finally {
      setIsLoadingRegular(false);
    }
  }, [searchParams]);

  // Load micro categories
  const fetchMicroCategories = useCallback(async () => {
    setIsLoadingMicro(true);
    try {
      const result = await getMicroCategories();
      if (result.success && result.data) {
        setMicroCategories(result.data);
      } else {
        toast.error(result.error || "获取便民公共设施列表失败");
      }
    } catch (error) {
      console.error("获取便民公共设施列表失败:", error);
      toast.error("获取便民公共设施列表失败");
    } finally {
      setIsLoadingMicro(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "regular") {
      fetchRegularCategories();
    }
  }, [activeTab, fetchRegularCategories]);

  useEffect(() => {
    if (activeTab === "micro") {
      fetchMicroCategories();
    }
  }, [activeTab, fetchMicroCategories]);

  const openCreateModal = (isMicro: boolean) => {
    setModalMode("create");
    setModalIsMicro(isMicro);
    setModalName("");
    setModalIcon("");
    setModalEditingId(null);
    setModalOpen(true);
  };

  const openEditModal = (item: MicroCategoryItem) => {
    setModalMode("edit");
    setModalIsMicro(true);
    setModalName(item.name);
    setModalIcon(item.icon || "");
    setModalEditingId(item.id);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalEditingId(null);
  };

  const handleModalSubmit = async () => {
    const trimmedName = modalName.trim();
    if (!trimmedName) {
      toast.error("请输入分类名称");
      return;
    }

    setModalSubmitting(true);
    try {
      if (modalMode === "edit" && modalEditingId) {
        const result = await updateMicroCategory(modalEditingId, {
          name: trimmedName,
          icon: modalIcon.trim() || null,
        });
        if (result.success) {
          toast.success("便民公共设施更新成功");
          closeModal();
          fetchMicroCategories();
        } else {
          toast.error(result.message || "更新失败");
        }
      } else {
        if (modalIsMicro) {
          const result = await createMicroCategory({
            name: trimmedName,
            icon: modalIcon.trim() || null,
          });
          if (result.success) {
            toast.success("便民公共设施创建成功");
            closeModal();
            fetchMicroCategories();
          } else {
            toast.error(result.message || "创建失败");
          }
        } else {
          const result = await createGlobalCategory({
            name: trimmedName,
            icon: modalIcon.trim() || null,
          });
          if (!result.success) {
            throw new Error(result.error || "创建失败");
          }
          toast.success("全局分类创建成功");
          closeModal();
          fetchRegularCategories();
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败，请重试");
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteRegular = async (id: string, name: string) => {
    if (!confirm(`确定要删除全局分类"${name}"吗？此操作将影响所有学校，且不可恢复。`)) {
      return;
    }
    setDeletingRegularId(id);
    try {
      const result = await deleteGlobalCategory(id);
      if (!result.success) throw new Error(result.error || "删除失败");
      toast.success("全局分类已删除");
      fetchRegularCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingRegularId(null);
    }
  };

  const handleDeleteMicro = async (id: string, name: string) => {
    if (!confirm(`确定要删除便民公共设施"${name}"吗？此操作不可恢复。`)) {
      return;
    }
    setDeletingMicroId(id);
    try {
      const result = await deleteMicroCategory(id);
      if (result.success) {
        toast.success("便民公共设施已删除");
        fetchMicroCategories();
      } else {
        toast.error(result.message || "删除失败");
      }
    } catch (error) {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingMicroId(null);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <Link
        href="/super-admin/categories/all"
        className="flex items-center gap-2 rounded-lg border border-[#FF4500]/40 bg-[#FFE5DD] px-4 py-2 text-sm font-medium text-[#FF4500] transition-colors hover:bg-[#FFE5DD]/80"
      >
        <LayoutGrid className="h-4 w-4" />
        全量分类监控
      </Link>
      <button
        onClick={() => openCreateModal(activeTab === "micro")}
        className="flex items-center gap-2 rounded-full bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        {activeTab === "regular" ? "新增常规全局分类" : "新增便民公共设施"}
      </button>
    </div>
  );

  const tabs = (
    <div className="border-b border-[#EDEFF1]">
      <div className="flex gap-6">
        <button
          onClick={() => setActiveTab("regular")}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "regular"
              ? "border-[#FF4500] text-[#FF4500]"
              : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
          }`}
        >
          <Tags className="h-4 w-4" />
          常规全局分类
        </button>
        <button
          onClick={() => setActiveTab("micro")}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "micro"
              ? "border-[#FF4500] text-[#FF4500]"
              : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
          }`}
        >
          <Droplets className="h-4 w-4" />
          便民公共设施
        </button>
      </div>
    </div>
  );

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <>
          <AdminPageContainer
          title="分类管理"
          description="管理全平台默认分类与便民公共设施（饮水机、卫生间等）"
          headerActions={headerActions}
          headerExtra={tabs}
          scrollKey={`${activeTab}-${searchParams.get("page") ?? "1"}`}
          footer={
            activeTab === "regular" &&
            pagination &&
            pagination.total > 0 ? (
              <PaginationControls
                total={pagination.total}
                pageCount={pagination.pageCount}
                currentPage={pagination.currentPage}
              />
            ) : null
          }
        >
          {/* Tab content - scrollable list */}
          <div className="flex flex-col">
            {activeTab === "regular" && (
              <>
                {isLoadingRegular ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
                  </div>
                ) : categories.length === 0 ? (
                  <EmptyState
                    icon={Tags}
                    title="暂无常规全局分类"
                    description="创建第一个全局分类以作为所有学校的默认分类"
                  />
                ) : (
                  <>
                    <div className="divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white">
                      {categories.map((category) => (
                        <div
                          key={category.id}
                          className="px-4 py-2.5 transition-colors hover:bg-[#F6F7F8] h-14 flex items-center"
                        >
                          <div className="flex items-center justify-between gap-4 w-full">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Tags className="h-4 w-4 text-[#7C7C7C] flex-shrink-0" />
                                <span className="text-sm font-semibold text-[#1A1A1B] truncate">
                                  {category.name}
                                </span>
                                <span className="rounded bg-[#FFE5DD] px-2 py-0.5 text-xs font-medium text-[#FF4500]">
                                  系统默认
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-[#7C7C7C] ml-6">
                                <span>全平台 POI: {category.poiCount} 个</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => handleDeleteRegular(category.id, category.name)}
                                disabled={deletingRegularId === category.id || category.poiCount > 0}
                                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                title={
                                  category.poiCount > 0
                                    ? "该分类下仍有 POI，无法删除"
                                    : "删除全局分类"
                                }
                              >
                                {deletingRegularId === category.id ? (
                                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
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
                  </>
                )}
              </>
            )}

            {activeTab === "micro" && (
              <>
                {isLoadingMicro ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
                  </div>
                ) : microCategories.length === 0 ? (
                  <EmptyState
                    icon={Droplets}
                    title="暂无便民公共设施"
                    description="创建便民公共设施（如饮水机、卫生间）供各学校使用"
                  />
                ) : (
                  <div className="divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white">
                    {microCategories.map((category) => (
                      <div
                        key={category.id}
                        className="px-4 py-2.5 transition-colors hover:bg-[#F6F7F8] h-14 flex items-center"
                      >
                        <div className="flex items-center justify-between gap-4 w-full">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Droplets className="h-4 w-4 text-[#7C7C7C] flex-shrink-0" />
                              <span className="text-sm font-semibold text-[#1A1A1B] truncate">
                                {category.name}
                              </span>
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                便民
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-[#7C7C7C] ml-6">
                              <span>全平台 POI: {category.poiCount} 个</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => openEditModal(category)}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">编辑</span>
                            </button>
                            <button
                              onClick={() => handleDeleteMicro(category.id, category.name)}
                              disabled={deletingMicroId === category.id || category.poiCount > 0}
                              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title={
                                category.poiCount > 0
                                  ? "该分类下仍有 POI，无法删除"
                                  : "删除便民公共设施"
                              }
                            >
                              {deletingMicroId === category.id ? (
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
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
                )}
              </>
            )}
          </div>
        </AdminPageContainer>

        {/* Create/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
          <div className="modal-container max-w-md">
              <h2 className="modal-header px-6 pt-6 text-lg font-semibold text-[#1A1A1B]">
                {modalMode === "edit" ? "编辑便民公共设施" : "新增分类"}
              </h2>

              <div className="modal-body space-y-4 px-6 py-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                    分类名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    placeholder="如：食堂、饮水机、卫生间"
                    maxLength={50}
                    className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">图标（可选）</label>
                  <input
                    type="text"
                    value={modalIcon}
                    onChange={(e) => setModalIcon(e.target.value)}
                    placeholder="图标名称"
                    maxLength={50}
                    className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  />
                </div>

                {modalMode === "create" && (
                  <div>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={modalIsMicro}
                        onChange={(e) => setModalIsMicro(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#FF4500] focus:ring-[#FF4500]"
                      />
                      <span className="text-sm font-medium text-[#1A1A1B]">便民公共设施</span>
                    </label>
                    {modalIsMicro && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        This will be available to all schools globally.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer flex justify-end gap-3 px-6 py-4">
                <button
                  onClick={closeModal}
                  className="rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm font-medium text-[#7C7C7C] hover:bg-[#F6F7F8]"
                >
                  取消
                </button>
                <button
                  onClick={handleModalSubmit}
                  disabled={modalSubmitting || !modalName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {modalSubmitting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : null}
                  {modalMode === "edit" ? "保存" : "创建"}
                </button>
              </div>
            </div>
          </div>
        )}
        </>
      </AdminLayout>
    </AuthGuard>
  );
}
