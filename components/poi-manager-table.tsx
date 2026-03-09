"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { MapPin, Plus, Trash2, Edit, MoreVertical, Filter, X, ChevronRight, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { POIEditDialog } from "@/components/poi-edit-dialog";
import { getPOIsBySchool, deletePOI } from "@/lib/poi-actions";

interface POI {
  id: string;
  parentId?: string | null;
  name: string;
  alias?: string | null;
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
  children?: POI[];
}

interface POIManagerTableProps {
  schoolId: string;
  onAddPOI: () => void;
  /** 新增二级点：传入父 POI，打开表单并预填 parentId */
  onAddSubPOI?: (parentPOI: POI) => void;
  onEditPOI?: (poi: POI) => void;
  onDeletePOI?: (poiId: string) => void;
  /** 点击定位：地图 panTo 并打开信息窗体 */
  onFocusPOI?: (poi: POI) => void;
  /** 外部触发的编辑（如地图 Marker 点击），传入 POI 时打开编辑弹窗 */
  triggerEditPOI?: POI | null;
  /** 编辑弹窗打开后调用，用于清除外部触发状态 */
  onEditTriggered?: () => void;
  refreshKey?: number; // 用于强制刷新
  /** 嵌入模式：不渲染 Card 外壳，仅渲染列表内容（用于分栏布局） */
  embedded?: boolean;
  /** 层级模式：显示父子结构，支持折叠/展开与「新增二级点」 */
  hierarchical?: boolean;
}

/**
 * POI 管理表格组件
 * 显示指定学校的所有 POI 列表
 */
export function POIManagerTable({ schoolId, onAddPOI, onAddSubPOI, onEditPOI, onDeletePOI, onFocusPOI, triggerEditPOI, onEditTriggered, refreshKey, embedded, hierarchical }: POIManagerTableProps) {
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedPOIId, setSelectedPOIId] = useState<string | null>(null);

  // 筛选状态
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [reportFilter, setReportFilter] = useState<string>("all");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  // 加载 POI 列表
  const fetchPOIs = useCallback(async () => {
    if (!schoolId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const useHierarchy = hierarchical && embedded;
      const page = parseInt(searchParams.get("page") || "1", 10);
      const limit = 10;
      const result = await getPOIsBySchool(schoolId, useHierarchy ? {} : { page, limit });

      if (!result.success) {
        throw new Error(result.error || "获取 POI 列表失败");
      }

      const data = result.data;
      if (data) {
        const list = data.pois || [];
        setPois(list as POI[]);
        const p = data.pagination;
        setPagination(
          useHierarchy || !p
            ? null
            : {
                total: p.total,
                pageCount: p.totalPages,
                currentPage: p.page,
              }
        );
      } else {
        setPois([]);
      }
    } catch (err) {
      console.error("获取 POI 列表失败:", err);
      setError(err instanceof Error ? err.message : "获取 POI 列表失败");
      toast.error(err instanceof Error ? err.message : "获取 POI 列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, searchParams, hierarchical, embedded]);

  // 加载分类列表（用于筛选，含常规+便民公共设施）
  useEffect(() => {
    const fetchCategories = async () => {
      if (!schoolId) return;
      try {
        const response = await fetch("/api/admin/categories?all=true&grouped=true");
        const data = await response.json();
        if (data.success && data.data) {
          const { regular = [], convenience = [] } = data.data;
          setCategories([...regular, ...convenience]);
        }
      } catch (error) {
        console.error("获取分类列表失败:", error);
      }
    };

    fetchCategories();
  }, [schoolId]);

  useEffect(() => {
    fetchPOIs();
  }, [fetchPOIs, refreshKey]); // refreshKey 变化时强制刷新

  // 响应外部触发的编辑（如地图 Marker 点击）
  useEffect(() => {
    if (triggerEditPOI) {
      setEditingPOI(triggerEditPOI);
      onEditTriggered?.();
    }
  }, [triggerEditPOI, onEditTriggered]);

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

  // 构建层级树（仅当 hierarchical 时使用）
  const buildTree = (list: POI[]): (POI & { children: POI[] })[] => {
    const byId = new Map<string, POI & { children: POI[] }>();
    list.forEach((p) => byId.set(p.id, { ...p, children: [] }));
    const roots: (POI & { children: POI[] })[] = [];
    list.forEach((p) => {
      const node = byId.get(p.id)!;
      if (!p.parentId) {
        roots.push(node);
      } else {
        const parent = byId.get(p.parentId);
        if (parent) parent.children.push(node);
        else roots.push(node); // 孤儿节点当作根
      }
    });
    return roots;
  };

  // 筛选后的 POI 列表（扁平）
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

  // 层级模式下：筛选后构建树
  const filteredTree = hierarchical && embedded ? buildTree(filteredPOIs) : null;

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
        const result = await deletePOI(id);
        if (!result.success) {
          throw new Error(result.error || "删除失败");
        }
        return result;
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
        const result = await deletePOI(poiId);

        if (!result.success) {
          throw new Error(result.error || "删除失败");
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

  const listContent = (
    <div className={embedded ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}>
        {/* 筛选器（嵌入模式下固定顶部，非嵌入模式下在卡片上方） */}
        <div className={`flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4 ${
          embedded ? "shrink-0 border-b border-gray-200" : "mb-4"
        }`}>
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
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
        <div className={`flex items-center justify-center py-12 ${embedded ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className={`py-12 text-center ${embedded ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchPOIs}
            className="mt-4 rounded-lg bg-[#FF4500] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            重试
          </button>
        </div>
      ) : pois.length === 0 ? (
        <div className={embedded ? "min-h-0 flex-1 overflow-y-auto" : ""}>
          <EmptyState
          icon={MapPin}
          title="暂无 POI"
          description="点击「新增 POI」按钮添加第一个 POI"
          action={{
            label: "新增 POI",
            onClick: onAddPOI,
          }}
        />
        </div>
      ) : (
        <div className={`w-full ${embedded ? "min-h-0 flex-1 overflow-y-auto p-4" : ""}`}>
          {/* 全选 */}
          {filteredPOIs.length > 0 && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <input
                type="checkbox"
                checked={selectedPOIs.size === filteredPOIs.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedPOIs(new Set(filteredPOIs.map((p) => p.id)));
                  } else {
                    setSelectedPOIs(new Set());
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-[#FF4500] focus:ring-2 focus:ring-[#FF4500]/20"
              />
              <span className="text-xs text-gray-500">全选</span>
            </div>
          )}

          <div>
            {(() => {
              const renderCard = (poi: POI, isSub: boolean) => {
                const node = poi as POI & { children?: POI[] };
                const childCount = node.children?.length ?? 0;
                const isPrimary = !isSub;

                return (
                  <div
                    key={poi.id}
                    className={`group border-b p-3 transition-colors relative cursor-pointer ${
                      selectedPOIId === poi.id
                        ? `border-l-4 border-l-[#FF4500] bg-[#FFE5DD] ${isSub ? "ml-6 pl-3" : ""}`
                        : isSub
                          ? "ml-6 border-l-2 border-l-gray-300 bg-gray-50/60 pl-3 hover:bg-gray-50"
                          : "hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setSelectedPOIId(poi.id);
                      onFocusPOI?.(poi);
                    }}
                  >
                    {/* Top Row: checkbox + name | actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedPOIs.has(poi.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newSelected = new Set(selectedPOIs);
                            if (e.target.checked) newSelected.add(poi.id);
                            else newSelected.delete(poi.id);
                            setSelectedPOIs(newSelected);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-[#FF4500] focus:ring-2 focus:ring-[#FF4500]/20"
                        />
                        {isPrimary && childCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(poi.id)) next.delete(poi.id);
                                else next.add(poi.id);
                                return next;
                              });
                            }}
                            className="rounded p-0.5 text-gray-400 hover:bg-gray-200"
                          >
                            {expandedIds.has(poi.id) ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <span className="truncate font-medium text-sm" title={poi.name}>
                          {poi.name}
                        </span>
                      </div>
                      <div
                        className={`shrink-0 opacity-60 transition-opacity group-hover:opacity-100 ${
                          actionMenuOpen === poi.id ? "opacity-100" : ""
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 8,
                              right: window.innerWidth - rect.right,
                            });
                            setActionMenuOpen(actionMenuOpen === poi.id ? null : poi.id);
                          }}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                          title="操作"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: category badge */}
                    <div className="mt-1">
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                        {poi.category}
                      </span>
                    </div>

                    {/* Bottom Row: +二级点 or child count */}
                    <div className="mt-1 flex items-center gap-2">
                      {isPrimary && onAddSubPOI && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddSubPOI(poi);
                          }}
                          className="rounded px-2 py-0.5 text-[11px] text-gray-400 opacity-0 transition-opacity hover:bg-[#FFE5DD] hover:text-[#FF4500] group-hover:opacity-100"
                        >
                          ＋二级点
                        </button>
                      )}
                      {childCount > 0 && (
                        <span className="text-[11px] text-gray-400">
                          {childCount} 个二级点
                        </span>
                      )}
                    </div>
                  </div>
                );
              };

              if (filteredTree) {
                return filteredTree.flatMap((root) => {
                  const cards: JSX.Element[] = [
                    renderCard({ ...root, children: root.children }, false),
                  ];
                  if (expandedIds.has(root.id) && root.children.length > 0) {
                    root.children.forEach((child) => cards.push(renderCard(child, true)));
                  }
                  return cards;
                });
              }
              return filteredPOIs.map((poi) => renderCard(poi, false));
            })()}
          </div>

          {pagination && pagination.total > 0 && (
            <div className="mt-4 flex justify-center pb-4">
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
  );

  if (embedded) {
    return (
      <>
        {listContent}
        {/* 操作下拉菜单（使用 fixed 定位，避免被表格容器裁剪） */}
        {actionMenuOpen && menuPosition && (
                        <>
                          <div
            className="fixed inset-0 z-modal-overlay"
            onClick={() => {
              setActionMenuOpen(null);
              setMenuPosition(null);
            }}
                          />
          <div
            className="fixed z-modal-content w-32 rounded-lg border border-gray-200 bg-white shadow-xl"
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
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF4500] transition-colors hover:bg-[#FFE5DD]"
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

  return (
    <>
      <Card
        title="POI 列表"
        description={`共 ${pagination?.total || pois.length} 个 POI`}
        action={
          <button
            onClick={onAddPOI}
            className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            新增 POI
          </button>
        }
      >
        {listContent}
      </Card>
      {/* 操作下拉菜单 */}
      {actionMenuOpen && menuPosition && (
        <>
          <div
            className="fixed inset-0 z-modal-overlay"
            onClick={() => {
              setActionMenuOpen(null);
              setMenuPosition(null);
            }}
          />
          <div
            className="fixed z-modal-content w-32 rounded-lg border border-gray-200 bg-white shadow-xl"
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
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF4500] transition-colors hover:bg-[#FFE5DD]"
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

