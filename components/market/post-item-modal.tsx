"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ImageUpload } from "@/components/shared/image-upload";
import { createMarketItem, updateMarketItem } from "@/lib/market-actions";
import { uploadMarketImage } from "@/lib/upload-actions";
import { POICombobox } from "@/components/market/poi-combobox";
import toast from "react-hot-toast";
import { X, Loader2 } from "lucide-react";
import type { MarketItemDetailData } from "@/components/market/market-item-detail-modal";

const MAX_IMAGES = 9;

export interface MarketCategoryItem {
  id: string;
  name: string;
  order: number;
}

export interface TransactionTypeItem {
  id: number;
  name: string;
  code: string;
  order: number;
}

/** 按交易类型 ID 分组的物品分类 */
export type MarketCategoriesByType = Record<number, MarketCategoryItem[]>;

interface PostItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  schoolId: string;
  categoriesByType: MarketCategoriesByType;
  transactionTypes: TransactionTypeItem[];
  /** 编辑模式：传入要编辑的商品数据 */
  initialData?: MarketItemDetailData;
}

export function PostItemModal({
  isOpen,
  onClose,
  onSuccess,
  schoolId,
  categoriesByType,
  transactionTypes,
  initialData,
}: PostItemModalProps) {
  const router = useRouter();
  const isEditMode = !!initialData;
  const firstTypeId = transactionTypes[0]?.id ?? 0;
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState<number>(firstTypeId);
  const [categoryId, setCategoryId] = useState("");
  const [selectedPOI, setSelectedPOI] = useState<{ id: string; name: string } | null>(null);
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [price, setPrice] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageLoadingCount, setImageLoadingCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poiError, setPoiError] = useState("");

  // 初始化/重置表单：创建模式重置，编辑模式预填
  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setTitle(initialData.title);
      setTypeId(initialData.transactionType.id);
      setCategoryId(initialData.category?.id ?? "");
      setSelectedPOI(initialData.poi ? { id: initialData.poi.id, name: initialData.poi.name } : null);
      setDescription(initialData.description);
      setContact(initialData.contact ?? "");
      setPrice(initialData.price != null ? String(initialData.price) : "");
      setImages(initialData.images ?? []);
      setPoiError("");
    } else {
      setTitle("");
      setTypeId(firstTypeId);
      setCategoryId("");
      setSelectedPOI(null);
      setDescription("");
      setContact("");
      setPrice("");
      setImages([]);
      setPoiError("");
    }
  }, [isOpen, initialData, firstTypeId]);

  // 交易类型变化时清空物品分类（级联，仅创建模式）
  useEffect(() => {
    if (!isEditMode) setCategoryId("");
  }, [typeId, isEditMode]);

  const handleImageChange = (index: number) => (url: string) => {
    if (url) {
      setImages((prev) => {
        const next = [...prev];
        next[index] = url;
        return next.slice(0, MAX_IMAGES);
      });
    } else {
      setImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const selectedType = transactionTypes.find((t) => t.id === typeId);
  const needsPrice = selectedType?.code === "SALE";

  const isFormValid = () => {
    if (!title.trim()) return false;
    if (!description.trim()) return false;
    if (!selectedPOI?.id) return false;
    if (needsPrice && (!price || Number(price) < 0)) return false;
    return true;
  };

  // 根据交易类型获取可用物品分类（来自 MarketTypeCategory 关联）
  const availableCategories = categoriesByType[typeId] ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPOI?.id) {
      setPoiError("请从下拉列表中选择一个有效的地点");
      toast.error("请选择地点");
      return;
    }

    if (!title.trim() || !description.trim()) {
      toast.error("请填写标题和描述");
      return;
    }

    if (needsPrice && (!price || Number(price) < 0)) {
      toast.error("二手交易需填写有效价格");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(isEditMode ? "保存中..." : "发布中...");

    try {
      if (isEditMode && initialData) {
        const result = await updateMarketItem(initialData.id, {
          poiId: selectedPOI.id,
          categoryId: categoryId || null,
          title: title.trim(),
          description: description.trim(),
          contact: contact.trim() || null,
          price: needsPrice ? Number(price) : null,
          images,
        });

        if (result.success) {
          toast.success("保存成功", { id: toastId });
          onClose();
          onSuccess();
          router.refresh();
        } else {
          toast.error(result.error ?? "保存失败", { id: toastId });
        }
      } else {
        const result = await createMarketItem({
          poiId: selectedPOI.id,
          categoryId: categoryId || undefined,
          typeId,
          title: title.trim(),
          description: description.trim(),
          contact: contact.trim() || null,
          price: needsPrice ? Number(price) : null,
          images,
        });

        if (result.success) {
          toast.success("发布成功！商品将保留 7 天", { id: toastId });
          onClose();
          onSuccess();
          router.refresh();
        } else {
          toast.error(result.error ?? "发布失败", { id: toastId });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEditMode ? "保存失败" : "发布失败", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
      <div className="modal-container">
        <div className="modal-header flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold text-[#1A1A1B]">
            {isEditMode ? "编辑商品" : "发布商品"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="modal-body space-y-4 p-4">
          {!isEditMode && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              商品有效期为 7 天，过期后自动下架
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              物品名称 <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简要描述物品"
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              交易类型 <span className="text-red-500">*</span>
            </label>
            <select
              value={typeId}
              onChange={(e) => setTypeId(Number(e.target.value))}
              disabled={isEditMode}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              {transactionTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {isEditMode && (
              <p className="mt-1 text-xs text-gray-500">编辑时不可修改交易类型</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              物品分类 - 选填
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            >
              <option value="">
                {availableCategories.length === 0
                  ? "暂无物品分类"
                  : "请选择物品分类（可选）"}
              </option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              地点 (POI) <span className="text-red-500">*</span>
            </label>
            <POICombobox
              schoolId={schoolId}
              value={selectedPOI}
              onChange={(poi) => {
                setSelectedPOI(poi);
                setPoiError("");
              }}
              placeholder="搜索地点（如：越园）"
              error={poiError || undefined}
            />
            <p className="mt-1 text-xs text-gray-500">
              仅支持选择本校已有地点，输入关键词后从下拉列表中选择
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细描述物品详情等信息..."
              maxLength={2000}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
          </div>

          {needsPrice && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                价格 (元) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              图片（最多 {MAX_IMAGES} 张）
            </label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: Math.min(images.length + 1, MAX_IMAGES) }).map((_, i) => (
                <ImageUpload
                  key={i}
                  value={images[i] ?? ""}
                  onChange={handleImageChange(i)}
                  onUploading={(loading) =>
                    setImageLoadingCount((prev) => (loading ? prev + 1 : Math.max(0, prev - 1)))
                  }
                  uploadFn={uploadMarketImage}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">联系方式（可选）</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="手机/微信/QQ"
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
          </div>

          </div>

          <div className="modal-footer flex gap-2 p-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || imageLoadingCount > 0 || !isFormValid()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white hover:bg-[#E03D00] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEditMode ? "保存修改" : "发布"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
