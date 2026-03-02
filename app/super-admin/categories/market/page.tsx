"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTransactionType,
  updateTransactionType,
  deleteTransactionType,
  createMarketCategory,
  updateMarketCategory,
  deleteMarketCategory,
  toggleTypeCategory,
} from "@/lib/market-actions";
import {
  ShoppingBag,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Tags,
  Layers,
  Link2,
} from "lucide-react";
import { TableActions } from "@/components/ui/table-actions";
import toast from "react-hot-toast";

interface TransactionTypeItem {
  id: number;
  name: string;
  code: string;
  order: number;
  isActive: boolean;
}

interface MarketCategoryFlat {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { marketItems: number };
}

/**
 * 超级管理员 - 生存集市配置
 * Tab 1: 交易类型配置 | Tab 2: 物品分类池 | Tab 3: 类型关联配置
 */
export default function SuperAdminMarketCategoriesPage() {
  const [categories, setCategories] = useState<MarketCategoryFlat[]>([]);
  const [typeLinks, setTypeLinks] = useState<Record<string, number[]>>({});
  const [transactionTypes, setTransactionTypes] = useState<TransactionTypeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [deletingTypeId, setDeletingTypeId] = useState<number | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const initializedTypeRef = useRef(false);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalMode, setCatModalMode] = useState<"create" | "edit">("create");
  const [catModalEditingId, setCatModalEditingId] = useState<string | null>(null);
  const [catModalName, setCatModalName] = useState("");
  const [catModalOrder, setCatModalOrder] = useState(0);
  const [catModalSubmitting, setCatModalSubmitting] = useState(false);

  // Transaction type modal
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeModalMode, setTypeModalMode] = useState<"create" | "edit">("create");
  const [typeModalEditingId, setTypeModalEditingId] = useState<number | null>(null);
  const [typeModalName, setTypeModalName] = useState("");
  const [typeModalCode, setTypeModalCode] = useState("");
  const [typeModalOrder, setTypeModalOrder] = useState(0);
  const [typeModalIsActive, setTypeModalIsActive] = useState(true);
  const [typeModalSubmitting, setTypeModalSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/market-categories");
      const data = await res.json();
      if (data.success && data.data) {
        setCategories(data.data.categories || []);
        setTypeLinks(data.data.typeLinks || {});
        setTransactionTypes(data.data.transactionTypes || []);
        if (data.data.transactionTypes?.length && !initializedTypeRef.current) {
          initializedTypeRef.current = true;
          setSelectedTypeId(data.data.transactionTypes[0].id);
        }
      } else {
        toast.error(data.message || "获取数据失败");
      }
    } catch (error) {
      console.error("获取集市配置失败:", error);
      toast.error("获取数据失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Category CRUD ---
  const openCreateCategoryModal = () => {
    setCatModalMode("create");
    setCatModalEditingId(null);
    setCatModalName("");
    setCatModalOrder(0);
    setCatModalOpen(true);
  };

  const openEditCategoryModal = (cat: MarketCategoryFlat) => {
    setCatModalMode("edit");
    setCatModalEditingId(cat.id);
    setCatModalName(cat.name);
    setCatModalOrder(cat.order);
    setCatModalOpen(true);
  };

  const handleCategorySubmit = async () => {
    const trimmedName = catModalName.trim();
    if (!trimmedName) {
      toast.error("请输入分类名称");
      return;
    }
    setCatModalSubmitting(true);
    try {
      if (catModalMode === "edit" && catModalEditingId) {
        const result = await updateMarketCategory(catModalEditingId, {
          name: trimmedName,
          order: catModalOrder,
        });
        if (result.success) {
          toast.success("更新成功");
          setCatModalOpen(false);
          fetchData();
        } else {
          toast.error(result.error ?? "更新失败");
        }
      } else {
        const result = await createMarketCategory({
          name: trimmedName,
          order: catModalOrder,
        });
        if (result.success) {
          toast.success("创建成功");
          setCatModalOpen(false);
          fetchData();
        } else {
          toast.error(result.error ?? "创建失败");
        }
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setCatModalSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`确定要删除分类「${name}」吗？此操作不可恢复。`)) return;
    setDeletingCatId(id);
    try {
      const result = await deleteMarketCategory(id);
      if (result.success) {
        toast.success("删除成功");
        fetchData();
      } else {
        toast.error(result.error ?? "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingCatId(null);
    }
  };

  // --- Transaction Type CRUD ---
  const openCreateTypeModal = () => {
    setTypeModalMode("create");
    setTypeModalEditingId(null);
    setTypeModalName("");
    setTypeModalCode("");
    setTypeModalOrder(transactionTypes.length);
    setTypeModalIsActive(true);
    setTypeModalOpen(true);
  };

  const openEditTypeModal = (t: TransactionTypeItem) => {
    setTypeModalMode("edit");
    setTypeModalEditingId(t.id);
    setTypeModalName(t.name);
    setTypeModalCode(t.code);
    setTypeModalOrder(t.order);
    setTypeModalIsActive(t.isActive);
    setTypeModalOpen(true);
  };

  const handleTypeSubmit = async () => {
    const trimmedName = typeModalName.trim();
    const trimmedCode = typeModalCode.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      toast.error("请输入名称和编码");
      return;
    }
    setTypeModalSubmitting(true);
    try {
      if (typeModalMode === "edit" && typeModalEditingId != null) {
        const result = await updateTransactionType(typeModalEditingId, {
          name: trimmedName,
          code: trimmedCode,
          order: typeModalOrder,
          isActive: typeModalIsActive,
        });
        if (result.success) {
          toast.success("更新成功");
          setTypeModalOpen(false);
          fetchData();
        } else {
          toast.error(result.error ?? "更新失败");
        }
      } else {
        const result = await createTransactionType({
          name: trimmedName,
          code: trimmedCode,
          order: typeModalOrder,
        });
        if (result.success) {
          toast.success("创建成功");
          setTypeModalOpen(false);
          fetchData();
        } else {
          toast.error(result.error ?? "创建失败");
        }
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setTypeModalSubmitting(false);
    }
  };

  const handleDeleteType = async (id: number, name: string) => {
    if (!confirm(`确定要删除交易类型「${name}」吗？此操作不可恢复。`)) return;
    setDeletingTypeId(id);
    try {
      const result = await deleteTransactionType(id);
      if (result.success) {
        toast.success("删除成功");
        if (selectedTypeId === id) {
          const next = transactionTypes.find((t) => t.id !== id);
          setSelectedTypeId(next?.id ?? null);
        }
        fetchData();
      } else {
        toast.error(result.error ?? "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingTypeId(null);
    }
  };

  // --- Type-Category Mapping ---
  const handleToggleMapping = async (typeId: number, categoryId: string) => {
    const key = `${typeId}-${categoryId}`;
    setToggling(key);
    try {
      const result = await toggleTypeCategory(typeId, categoryId);
      if (result.success) {
        toast.success(result.data?.linked ? "已关联" : "已取消关联");
        fetchData();
      } else {
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setToggling(null);
    }
  };

  const isLinked = (categoryId: string, typeId: number) =>
    (typeLinks[categoryId] ?? []).includes(typeId);

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1B]">生存集市配置</h1>
            <p className="mt-1 text-sm text-[#7C7C7C]">
              管理交易类型、物品分类池及类型与分类的关联关系。
            </p>
          </div>

          <Tabs defaultValue="types" className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="types" className="flex items-center gap-2">
                <Tags className="h-4 w-4" />
                交易类型配置
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                物品分类池
              </TabsTrigger>
              <TabsTrigger value="mapping" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                类型关联配置
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Transaction Types */}
            <TabsContent value="types" className="mt-4">
              <section className="rounded-xl border border-[#EDEFF1] bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#EDEFF1] bg-[#F6F7F8] px-4 py-3">
                  <h2 className="text-base font-semibold text-[#1A1A1B]">交易类型</h2>
                  <button
                    onClick={openCreateTypeModal}
                    className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                    添加类型
                  </button>
                </div>
                <div className="min-h-[200px]">
                  {isLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-[#FF4500]" />
                    </div>
                  ) : transactionTypes.length === 0 ? (
                    <EmptyState
                      icon={Tags}
                      title="暂无交易类型"
                      description="点击「添加类型」创建交易类型（如：二手交易、以物换物）"
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#EDEFF1] bg-[#FAFAFA]">
                          <th className="px-4 py-3 text-left font-medium text-[#1A1A1B]">名称</th>
                          <th className="px-4 py-3 text-left font-medium text-[#7C7C7C]">Code</th>
                          <th className="px-4 py-3 text-left font-medium text-[#7C7C7C]">排序</th>
                          <th className="px-4 py-3 text-left font-medium text-[#7C7C7C]">状态</th>
                          <th className="px-4 py-3 text-right font-medium text-[#1A1A1B]">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionTypes.map((t) => (
                          <tr
                            key={t.id}
                            className="border-b border-[#EDEFF1] last:border-b-0 hover:bg-[#F6F7F8] transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-[#1A1A1B]">{t.name}</td>
                            <td className="px-4 py-3 text-[#7C7C7C] font-mono text-xs">
                              {t.code}
                            </td>
                            <td className="px-4 py-3 text-[#7C7C7C]">{t.order}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  t.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {t.isActive ? "启用" : "停用"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <TableActions
                                disabled={deletingTypeId === t.id}
                                items={[
                                  { label: "编辑", icon: Pencil, onClick: () => openEditTypeModal(t) },
                                  "separator",
                                  {
                                    label: "删除",
                                    icon: Trash2,
                                    onClick: () => handleDeleteType(t.id, t.name),
                                    variant: "destructive",
                                  },
                                ]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </TabsContent>

            {/* Tab 2: Global Item Categories */}
            <TabsContent value="categories" className="mt-4">
              <section className="rounded-xl border border-[#EDEFF1] bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#EDEFF1] bg-[#F6F7F8] px-4 py-3">
                  <h2 className="text-base font-semibold text-[#1A1A1B]">全局物品分类池</h2>
                  <button
                    onClick={openCreateCategoryModal}
                    className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                    添加分类
                  </button>
                </div>
                <div className="min-h-[200px]">
                  {isLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-[#FF4500]" />
                    </div>
                  ) : categories.length === 0 ? (
                    <EmptyState
                      icon={ShoppingBag}
                      title="暂无物品分类"
                      description="点击「添加分类」创建全局物品分类（如：书本、电子产品）"
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#EDEFF1] bg-[#FAFAFA]">
                          <th className="px-4 py-3 text-left font-medium text-[#1A1A1B]">
                            分类名称
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-[#7C7C7C]">
                            排序
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-[#7C7C7C]">
                            商品数
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-[#1A1A1B]">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map((cat) => (
                          <tr
                            key={cat.id}
                            className="border-b border-[#EDEFF1] last:border-b-0 hover:bg-[#F6F7F8] transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-[#1A1A1B]">{cat.name}</td>
                            <td className="px-4 py-3 text-[#7C7C7C]">{cat.order}</td>
                            <td className="px-4 py-3 text-[#7C7C7C]">{cat._count.marketItems}</td>
                            <td className="px-4 py-3 text-right">
                              <TableActions
                                disabled={deletingCatId === cat.id || cat._count.marketItems > 0}
                                items={[
                                  { label: "编辑", icon: Pencil, onClick: () => openEditCategoryModal(cat) },
                                  "separator",
                                  {
                                    label: "删除",
                                    icon: Trash2,
                                    onClick: () => handleDeleteCategory(cat.id, cat.name),
                                    variant: "destructive",
                                    disabled: cat._count.marketItems > 0,
                                  },
                                ]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </TabsContent>

            {/* Tab 3: Type-Category Mapping */}
            <TabsContent value="mapping" className="mt-4">
              <section className="rounded-xl border border-[#EDEFF1] bg-white overflow-hidden">
                <div className="border-b border-[#EDEFF1] bg-[#F6F7F8] px-4 py-3">
                  <h2 className="text-base font-semibold text-[#1A1A1B]">类型关联配置</h2>
                  <p className="mt-1 text-xs text-[#7C7C7C]">
                    左侧选择交易类型，右侧勾选该类型下可用的物品分类。用户发布该类型商品时，仅能看到已勾选的分类。
                  </p>
                </div>
                <div className="flex flex-col md:flex-row min-h-[320px]">
                  {/* Left: Transaction Types */}
                  <div className="md:w-64 border-b md:border-b-0 md:border-r border-[#EDEFF1] bg-[#FAFAFA] p-4">
                    <p className="mb-2 text-xs font-medium text-[#7C7C7C]">交易类型</p>
                    {transactionTypes.length === 0 ? (
                      <p className="text-sm text-[#7C7C7C]">请先在「交易类型配置」中添加类型</p>
                    ) : (
                      <div className="space-y-1">
                        {transactionTypes.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTypeId(t.id)}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                              selectedTypeId === t.id
                                ? "bg-[#FF4500] text-white"
                                : "bg-white text-[#1A1A1B] hover:bg-[#F6F7F8] border border-[#EDEFF1]"
                            }`}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Right: Categories with checkboxes */}
                  <div className="flex-1 p-4">
                    <p className="mb-3 text-xs font-medium text-[#7C7C7C]">
                      {selectedTypeId != null
                        ? `为「${transactionTypes.find((t) => t.id === selectedTypeId)?.name ?? ""}」选择可用分类`
                        : "请先选择左侧交易类型"}
                    </p>
                    {categories.length === 0 ? (
                      <p className="py-8 text-center text-sm text-[#7C7C7C]">
                        请先在「物品分类池」中添加分类
                      </p>
                    ) : selectedTypeId == null ? (
                      <p className="py-8 text-center text-sm text-[#7C7C7C]">
                        请从左侧选择一个交易类型
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {categories.map((cat) => {
                          const key = `${selectedTypeId}-${cat.id}`;
                          const linked = isLinked(cat.id, selectedTypeId);
                          const busy = toggling === key;
                          return (
                            <label
                              key={cat.id}
                              className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                                linked
                                  ? "border-[#FF4500]/40 bg-[#FFE5DD]/30"
                                  : "border-[#EDEFF1] hover:bg-[#F6F7F8]"
                              } ${busy ? "opacity-60 pointer-events-none" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={linked}
                                onChange={() =>
                                  handleToggleMapping(selectedTypeId, cat.id)
                                }
                                disabled={busy}
                                className="h-4 w-4 rounded border-gray-300 text-[#FF4500] focus:ring-[#FF4500]"
                              />
                              <span className="flex-1 text-sm font-medium text-[#1A1A1B]">
                                {cat.name}
                              </span>
                              {busy && (
                                <Loader2 className="h-4 w-4 animate-spin text-[#FF4500] shrink-0" />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>

        {/* Category Add/Edit Modal */}
        <Modal
          isOpen={catModalOpen}
          onClose={() => setCatModalOpen(false)}
          containerClassName="max-w-md"
        >
          <h2 className="modal-header px-6 pt-6 text-lg font-semibold text-[#1A1A1B]">
            {catModalMode === "edit" ? "编辑物品分类" : "添加物品分类"}
          </h2>
          <div className="modal-body space-y-4 px-6 py-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                分类名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={catModalName}
                onChange={(e) => setCatModalName(e.target.value)}
                placeholder="如：书本、电子产品"
                maxLength={50}
                className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                排序（数字越小越靠前）
              </label>
              <input
                type="number"
                value={catModalOrder}
                onChange={(e) => setCatModalOrder(parseInt(e.target.value, 10) || 0)}
                min={0}
                className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
          </div>
          <div className="modal-footer flex justify-end gap-3 px-6 py-4">
            <button
              onClick={() => setCatModalOpen(false)}
              className="rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm font-medium text-[#7C7C7C] hover:bg-[#F6F7F8]"
            >
              取消
            </button>
            <button
              onClick={handleCategorySubmit}
              disabled={catModalSubmitting || !catModalName.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {catModalSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {catModalMode === "edit" ? "保存" : "添加"}
            </button>
          </div>
        </Modal>

        {/* Transaction Type Add/Edit Modal */}
        <Modal
          isOpen={typeModalOpen}
          onClose={() => setTypeModalOpen(false)}
          containerClassName="max-w-md"
        >
          <h2 className="modal-header px-6 pt-6 text-lg font-semibold text-[#1A1A1B]">
            {typeModalMode === "edit" ? "编辑交易类型" : "添加交易类型"}
          </h2>
          <div className="modal-body space-y-4 px-6 py-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={typeModalName}
                onChange={(e) => setTypeModalName(e.target.value)}
                placeholder="如：二手交易"
                maxLength={50}
                className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={typeModalCode}
                onChange={(e) => setTypeModalCode(e.target.value)}
                placeholder="如：SALE（用于前端逻辑、图标）"
                maxLength={20}
                className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm font-mono uppercase focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
              <p className="mt-1 text-xs text-[#7C7C7C]">
                唯一标识，建议大写英文（如 SALE、SWAP、BORROW）
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
                排序（数字越小越靠前）
              </label>
              <input
                type="number"
                value={typeModalOrder}
                onChange={(e) => setTypeModalOrder(parseInt(e.target.value, 10) || 0)}
                min={0}
                className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
            {typeModalMode === "edit" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeModalIsActive}
                  onChange={(e) => setTypeModalIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#FF4500] focus:ring-[#FF4500]"
                />
                <span className="text-sm font-medium text-[#1A1A1B]">启用</span>
              </label>
            )}
          </div>
          <div className="modal-footer flex justify-end gap-3 px-6 py-4">
            <button
              onClick={() => setTypeModalOpen(false)}
              className="rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm font-medium text-[#7C7C7C] hover:bg-[#F6F7F8]"
            >
              取消
            </button>
            <button
              onClick={handleTypeSubmit}
              disabled={
                typeModalSubmitting ||
                !typeModalName.trim() ||
                !typeModalCode.trim()
              }
              className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {typeModalSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {typeModalMode === "edit" ? "保存" : "添加"}
            </button>
          </div>
        </Modal>
      </AdminLayout>
    </AuthGuard>
  );
}
