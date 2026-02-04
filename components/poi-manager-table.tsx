"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MapPin, Plus, Trash2, Edit, MoreVertical, Filter, X } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { POIEditDialog } from "@/components/poi-edit-dialog";

interface POI {
  id: string;
  name: string;
  category: string;
  categoryId: string | null;
  lat: number;
  lng: number;
  description: string | null;
  isOfficial: boolean;
  reportCount: number;
  createdAt: string;
  currentStatus?: {
    statusType: string;
    val: number;
    expiresAt: string;
    updatedAt?: string;
  };
}

interface POIManagerTableProps {
  schoolId: string;
  onAddPOI: () => void;
  onEditPOI?: (poi: POI) => void;
  onDeletePOI?: (poiId: string) => void;
  refreshKey?: number; // 用于强制刷新
}

/**
 * POI 管理表格组件
 * 显示指定学校的所有 POI 列表
 */
export function POIManagerTable({ schoolId, onAddPOI, onEditPOI, onDeletePOI, refreshKey }: POIManagerTableProps) {
  const searchParams = useSearchParams();
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [editingPOI, setEditingPOI] = useState<POI | null>(null);
  const [selectedPOIs, setSelectedPOIs] = useState<Set<string>>(new Set());
  
  // 筛选状态
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [reportFilter, setReportFilter] = useState<string>("all");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  // 加载 POI 列表
  const fetchPOIs = async () => {
    if (!schoolId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const response = await fetch(`/api/pois?schoolId=${schoolId}&page=${currentPage}&limit=10`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "获取 POI 列表失败");
      }

      if (data.success) {
        // 支持分页和非分页两种格式
        setPois(data.data || data.pois || []);
        setPagination(data.pagination || null);
      } else {
        throw new Error(data.message || "获取 POI 列表失败");
      }
    } catch (err) {
      console.error("获取 POI 列表失败:", err);
      setError(err instanceof Error ? err.message : "获取 POI 列表失败");
      toast.error(err instanceof Error ? err.message : "获取 POI 列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 加载分类列表（用于筛选）
  useEffect(() => {
    const fetchCategories = async () => {
      if (!schoolId) return;
      try {
        const response = await fetch(`/api/admin/categories?schoolId=${schoolId}`);
        const data = await response.json();
        if (data.success) {
          setCategories(data.data || []);
        }
      } catch (error) {
        console.error("获取分类列表失败:", error);
      }
    };

    fetchCategories();
  }, [schoolId]);

  useEffect(() => {
    fetchPOIs();
  }, [schoolId, refreshKey, searchParams]); // schoolId、refreshKey 或分页变化时重新加载

  // 处理编辑
  const handleEdit = (poi: POI) => {
    setEditingPOI(poi);
    setActionMenuOpen(null);
  };

  // 处理保存后的刷新
  const handleSave = () => {
    fetchPOIs();
    if (onEditPOI) {
      // 如果提供了外部回调，也调用它
      const updatedPOI = pois.find((p) => p.id === editingPOI?.id);
      if (updatedPOI) {
        onEditPOI(updatedPOI);
      }
    }
  };

  // 筛选后的 POI 列表
  const filteredPOIs = pois.filter((poi) => {
    if (categoryFilter !== "all" && poi.categoryId !== categoryFilter) {
      return false;
    }
    if (reportFilter === "hasReport" && poi.reportCount === 0) {
      return false;
    }
    if (reportFilter === "noReport" && poi.reportCount > 0) {
      return false;
    }
    return true;
  });

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedPOIs.size === 0) {
      toast.error("请先选择要删除的 POI");
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedPOIs.size} 个 POI 吗？此操作不可逆。`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedPOIs).map(async (id) => {
        const response = await fetch(`/api/pois/${id}`, { method: "DELETE" });
        
        // 健壮性优化：先检查响应状态，再解析 JSON
        if (!response.ok) {
          let errorMessage = "删除失败";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            errorMessage = `删除失败 (${response.status} ${response.statusText})`;
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "删除失败");
        }
        
        return data;
      });
      
      await Promise.all(deletePromises);
      toast.success(`已删除 ${selectedPOIs.size} 个 POI`);
      setSelectedPOIs(new Set());
      await fetchPOIs();
    } catch (error) {
      console.error("批量删除失败:", error);
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    }
  };

  // 删除 POI（如果提供了回调函数，使用回调；否则内部处理）
  const handleDelete = async (poiId: string) => {
    if (!confirm("确定要删除这个 POI 吗？此操作不可逆。")) {
      return;
    }

    if (onDeletePOI) {
      // 使用外部提供的删除函数
      onDeletePOI(poiId);
      setActionMenuOpen(null);
      // 延迟刷新，等待外部删除完成
      setTimeout(() => {
        fetchPOIs();
      }, 500);
    } else {
      // 内部处理删除
      try {
        const response = await fetch(`/api/pois/${poiId}`, {
          method: "DELETE",
        });

        // 健壮性优化：先检查响应状态，再解析 JSON
        if (!response.ok) {
          // 尝试解析错误信息
          let errorMessage = "删除失败";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // 如果 JSON 解析失败，使用状态码信息
            errorMessage = `删除失败 (${response.status} ${response.statusText})`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || "删除失败");
        }

        toast.success("POI 删除成功");
        setActionMenuOpen(null);
        await fetchPOIs(); // 刷新列表
      } catch (error) {
        console.error("删除 POI 失败:", error);
        toast.error(error instanceof Error ? error.message : "删除失败");
      }
    }
  };

  // 获取分类 Badge
  const getCategoryBadge = (category: string) => {
    const categoryMap: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
      餐饮: { label: "餐饮", variant: "error" },
      教学: { label: "教学", variant: "info" },
      办公: { label: "办公", variant: "default" },
      快递: { label: "快递", variant: "warning" },
      运动: { label: "运动", variant: "success" },
      其他: { label: "其他", variant: "default" },
    };

    const config = categoryMap[category] || { label: category, variant: "default" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // 获取状态 Badge（带更新时间）
  const getStatusBadge = (status?: POI["currentStatus"]) => {
    if (!status) {
      return <Badge variant="default">无状态</Badge>;
    }

    const statusMap: Record<number, { label: string; variant: "default" | "success" | "warning" | "error" }> = {
      1: { label: "空闲", variant: "success" },
      2: { label: "正常", variant: "default" },
      3: { label: "拥挤", variant: "warning" },
      4: { label: "爆满", variant: "error" },
    };

    const config = statusMap[status.val] || { label: "未知", variant: "default" as const };
    const updatedAt = status.updatedAt
      ? new Date(status.updatedAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    return (
      <div className="flex flex-col gap-1">
        <Badge variant={config.variant}>{config.label}</Badge>
        {updatedAt && (
          <span className="text-xs text-gray-500">{updatedAt}</span>
        )}
      </div>
    );
  };

  return (
    <>
    <Card
      title="POI 列表"
        description={`共 ${pagination?.total || pois.length} 个 POI`}
      action={
        <button
          onClick={onAddPOI}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新增 POI
        </button>
      }
    >
        {/* 筛选器 */}
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">筛选：</span>
          </div>

          {/* 分类筛选 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">分类：</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">全部</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* 举报数筛选 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">举报数：</label>
            <select
              value={reportFilter}
              onChange={(e) => setReportFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">全部</option>
              <option value="hasReport">有举报</option>
              <option value="noReport">无举报</option>
            </select>
          </div>

          {/* 清除筛选 */}
          {(categoryFilter !== "all" || reportFilter !== "all") && (
            <button
              onClick={() => {
                setCategoryFilter("all");
                setReportFilter("all");
              }}
              className="ml-auto flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5" />
              清除筛选
            </button>
          )}

          {/* 批量操作 */}
          {selectedPOIs.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="ml-auto flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量删除 ({selectedPOIs.size})
            </button>
          )}
        </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchPOIs}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      ) : pois.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="暂无 POI"
          description="点击「新增 POI」按钮添加第一个 POI"
          action={{
            label: "新增 POI",
            onClick: onAddPOI,
          }}
        />
      ) : (
        <div className="min-h-[500px] flex flex-col">
          <div className="flex-1 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={selectedPOIs.size === filteredPOIs.length && filteredPOIs.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPOIs(new Set(filteredPOIs.map((p) => p.id)));
                        } else {
                          setSelectedPOIs(new Set());
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
                    />
                  </TableHead>
                <TableHead className="w-[200px]">POI 名称</TableHead>
                <TableHead className="w-[100px]">分类</TableHead>
                <TableHead className="w-[120px]">坐标</TableHead>
                  <TableHead className="w-[120px]">当前状态</TableHead>
                <TableHead className="w-[80px]">举报数</TableHead>
                <TableHead className="w-[100px]">类型</TableHead>
                <TableHead className="w-[120px]">创建日期</TableHead>
                <TableHead className="w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {filteredPOIs.map((poi) => (
                  <TableRow key={poi.id} className="h-16">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedPOIs.has(poi.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedPOIs);
                          if (e.target.checked) {
                            newSelected.add(poi.id);
                          } else {
                            newSelected.delete(poi.id);
                          }
                          setSelectedPOIs(newSelected);
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
                      />
                    </TableCell>
                  <TableCell className="font-medium">{poi.name}</TableCell>
                  <TableCell>{getCategoryBadge(poi.category)}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {poi.lat.toFixed(6)}, {poi.lng.toFixed(6)}
                  </TableCell>
                  <TableCell>{getStatusBadge(poi.currentStatus)}</TableCell>
                  <TableCell>
                    {poi.reportCount > 0 ? (
                      <Badge variant="error">{poi.reportCount}</Badge>
                    ) : (
                      <span className="text-sm text-gray-500">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {poi.isOfficial ? (
                      <Badge variant="success">官方</Badge>
                    ) : (
                      <Badge variant="default">众包</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(poi.createdAt).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="relative">
                      <button
                          onClick={(e) => {
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 8,
                              right: window.innerWidth - rect.right,
                            });
                            setActionMenuOpen(actionMenuOpen === poi.id ? null : poi.id);
                          }}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      </Card>

      {/* 操作下拉菜单（使用 fixed 定位，避免被表格容器裁剪） */}
      {actionMenuOpen && menuPosition && (
                        <>
                          <div
            className="fixed inset-0 z-[100]"
            onClick={() => {
              setActionMenuOpen(null);
              setMenuPosition(null);
            }}
                          />
          <div
            className="fixed z-[101] w-32 rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
            }}
          >
                            <div className="p-1">
              {(() => {
                const poi = pois.find((p) => p.id === actionMenuOpen);
                if (!poi) return null;
                return (
                  <>
                                <button
                                  onClick={() => {
                        handleEdit(poi);
                                    setActionMenuOpen(null);
                        setMenuPosition(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50"
                                >
                                  <Edit className="h-4 w-4" />
                                  编辑
                                </button>
                              {onDeletePOI && (
                                <>
                        <div className="my-1 h-px bg-gray-200"></div>
                                  <button
                                    onClick={() => {
                                      handleDelete(poi.id);
                            setActionMenuOpen(null);
                            setMenuPosition(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    删除
                                  </button>
                                </>
                              )}
                  </>
                );
              })()}
                            </div>
                          </div>
                        </>
                      )}

      {/* POI 编辑对话框 */}
      {editingPOI && (
        <POIEditDialog
          poi={editingPOI}
          schoolId={schoolId}
          isOpen={!!editingPOI}
          onClose={() => setEditingPOI(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

