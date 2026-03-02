"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState } from "@/components/empty-state";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/table";
import { Tags, Globe, Building2, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useDebounce } from "@/hooks/use-debounce";
import {
  getAllUniqueCategories,
  updateCategory,
  deleteCategory,
  type SystemCategoryItem,
  type LocalCategoryItem,
} from "@/lib/category-actions";
import { formatDate } from "@/lib/utils";

/**
 * 超级管理员 - 全量分类监控
 * Section A: 系统分类（编辑/删除）
 * Section B: 校内分类画廊（可搜索、按学校筛选）
 */
export default function SuperAdminAllCategoriesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SuperAdminAllCategoriesPageContent />
    </Suspense>
  );
}

function SuperAdminAllCategoriesPageContent() {
  const [systemCategories, setSystemCategories] = useState<SystemCategoryItem[]>([]);
  const [localCategories, setLocalCategories] = useState<LocalCategoryItem[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchKeyword, setSearchKeyword] = useState("");
  const debouncedKeyword = useDebounce(searchKeyword, 300);
  const [filterSchoolId, setFilterSchoolId] = useState("");

  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllUniqueCategories({
        keyword: debouncedKeyword || undefined,
        schoolId: filterSchoolId || undefined,
      });
      if (result.success) {
        setSystemCategories(result.systemCategories ?? []);
        setLocalCategories(result.localCategories ?? []);
        setSchools(result.schools ?? []);
      } else {
        toast.error(result.error ?? "获取分类列表失败");
      }
    } catch (error) {
      console.error("获取分类列表失败:", error);
      toast.error("获取分类列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedKeyword, filterSchoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSystemEdit = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error("分类名称不能为空");
      return;
    }
    const result = await updateCategory(id, { name: trimmed });
    if (result.success) {
      toast.success("分类已更新");
      setEditingSystemId(null);
      setEditName("");
      fetchData();
    } else {
      toast.error(result.error ?? "更新失败");
    }
  };

  const handleDeleteSystem = async (id: string, name: string) => {
    if (!confirm(`确定要删除系统分类"${name}"吗？此操作将影响所有学校，且不可恢复。`)) {
      return;
    }
    setDeletingId(id);
    try {
      const result = await deleteCategory(id);
      if (result.success) {
        toast.success("系统分类已删除");
        fetchData();
      } else {
        toast.error(result.error ?? "删除失败");
      }
    } catch (error) {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingId(null);
    }
  };

  const schoolOptions = [
    { value: "", label: "全部学校" },
    ...schools.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-4 md:p-6">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-[#1A1A1B]">全量分类监控</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              查看并管理系统分类，以及各学校创建的校内分类
            </p>
          </div>

          {/* Section A: 系统分类 */}
          <section className="mb-10">
            <h2 className="mb-3 flex items-center gap-2 text-base font-medium text-[#1A1A1B]">
              <Globe className="h-4 w-4 text-[#FF4500]" />
              系统分类
            </h2>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : systemCategories.length === 0 ? (
              <EmptyState
                icon={Globe}
                title="暂无系统分类"
                description="在「分类管理」中创建常规全局分类"
              />
            ) : (
              <div className="divide-y divide-[#EDEFF1] border border-[#EDEFF1] rounded-lg bg-white overflow-hidden">
                {systemCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-[#F6F7F8]"
                  >
                    <div className="flex-1 min-w-0">
                      {editingSystemId === cat.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveSystemEdit(cat.id);
                              if (e.key === "Escape") {
                                setEditingSystemId(null);
                                setEditName("");
                              }
                            }}
                            className="rounded border border-[#EDEFF1] px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveSystemEdit(cat.id)}
                            className="rounded px-3 py-1.5 text-xs font-medium text-[#FF4500] hover:bg-[#FFE5DD]"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => {
                              setEditingSystemId(null);
                              setEditName("");
                            }}
                            className="rounded px-3 py-1.5 text-xs text-[#7C7C7C] hover:bg-gray-100"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Tags className="h-4 w-4 text-[#7C7C7C] flex-shrink-0" />
                          <span className="text-sm font-semibold text-[#1A1A1B]">{cat.name}</span>
                          <span className="rounded-md bg-[#FFE5DD] px-2 py-0.5 text-xs font-semibold text-[#FF4500]">
                            系统默认
                          </span>
                          <span className="text-xs text-[#7C7C7C]">
                            关联 POI: {cat.poiCount} 个
                          </span>
                        </div>
                      )}
                    </div>
                    {editingSystemId !== cat.id && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingSystemId(cat.id);
                            setEditName(cat.name);
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">编辑</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSystem(cat.id, cat.name)}
                          disabled={deletingId === cat.id || cat.poiCount > 0}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            cat.poiCount > 0 ? "该分类下仍有 POI，无法删除" : "删除系统分类"
                          }
                        >
                          {deletingId === cat.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">删除</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section B: 校内分类画廊 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-medium text-[#1A1A1B]">
              <Building2 className="h-4 w-4 text-emerald-600" />
              校内分类画廊
            </h2>

            <div className="mb-4">
              <AdminFilterBar
                search={{
                  value: searchKeyword,
                  onChange: setSearchKeyword,
                  placeholder: "按分类名称搜索...",
                }}
                filters={[
                  {
                    value: filterSchoolId,
                    onChange: setFilterSchoolId,
                    options: schoolOptions,
                    label: "学校",
                  },
                ]}
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : localCategories.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="暂无校内分类"
                description={
                  debouncedKeyword || filterSchoolId
                    ? "当前筛选条件下无结果"
                    : "各学校尚未创建自定义分类"
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#EDEFF1] bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分类名称</TableHead>
                      <TableHead>所属学校</TableHead>
                      <TableHead>关联 POI</TableHead>
                      <TableHead responsiveHide="sm">创建时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localCategories.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Tags className="h-4 w-4 text-[#7C7C7C] flex-shrink-0" />
                            <span className="font-medium text-[#1A1A1B]">{cat.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-[#7C7C7C]">{cat.schoolName}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{cat.poiCount}</span>
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          <span className="text-sm text-[#7C7C7C]">
                            {formatDate(cat.createdAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
