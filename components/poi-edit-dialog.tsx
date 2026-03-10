"use client";

import { useState, useEffect, useRef } from "react";
import { X, MapPin, Save, Loader2, Trash2 } from "lucide-react";
import { uploadPOIImage } from "@/lib/upload-actions";
import { updatePOI, deletePOI } from "@/lib/poi-actions";
import { getSchoolCategoriesForAdmin } from "@/lib/category-actions";
import { ImageUpload } from "@/components/shared/image-upload";
import { useAMap } from "@/hooks/use-amap";
import { CoordinateConverter } from "@/lib/amap-loader";
import toast from "react-hot-toast";

interface CategoryItem {
  id: string;
  name: string;
  icon?: string | null;
}

interface GroupedCategories {
  regular: CategoryItem[];
  convenience: CategoryItem[];
}

interface POI {
  id: string;
  name: string;
  alias?: string | null;
  category: string;
  categoryId: string | null;
  lat: number;
  lng: number;
  description: string | null;
  imageUrl?: string | null;
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

interface POIEditDialogProps {
  poi: POI | null;
  schoolId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

/**
 * POI 编辑对话框组件
 * 支持编辑 POI 的所有字段，包括地图拾取坐标
 */
export function POIEditDialog({
  poi,
  schoolId,
  isOpen,
  onClose,
  onSave,
}: POIEditDialogProps) {
  const { amap, loading: amapLoading } = useAMap();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);

  const [categoryGroups, setCategoryGroups] = useState<GroupedCategories>({
    regular: [],
    convenience: [],
  });
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    alias: "" as string | null,
    categoryId: "",
    description: "",
    imageUrl: "" as string | null,
    lat: 0,
    lng: 0,
    isOfficial: false,
    statusOverride: {
      val: 0,
      statusType: "crowd",
      expiresAt: "",
    },
  });

  // 加载分类列表（常规 + 便民公共设施，分组）
  useEffect(() => {
    const fetchCategories = async () => {
      if (!schoolId) return;

      setIsLoadingCategories(true);
      try {
        const result = await getSchoolCategoriesForAdmin(schoolId, {
          all: true,
          grouped: true,
        });
        if (result.success && result.data && typeof result.data === "object") {
          const data = result.data as { regular?: Array<{ id: string; name: string; icon?: string | null }>; convenience?: Array<{ id: string; name: string; icon?: string | null }> };
          setCategoryGroups({
            regular: data.regular || [],
            convenience: data.convenience || [],
          });
        }
      } catch (error) {
        console.error("获取分类列表失败:", error);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    if (isOpen) {
      fetchCategories();
    }
  }, [schoolId, isOpen]);

  // 初始化表单数据
  useEffect(() => {
    if (poi && isOpen) {
      setFormData({
        name: poi.name,
        alias: (poi as POI).alias ?? "",
        categoryId: poi.categoryId || "",
        description: poi.description || "",
        imageUrl: (poi as POI & { imageUrl?: string | null }).imageUrl ?? null,
        lat: poi.lat,
        lng: poi.lng,
        isOfficial: poi.isOfficial,
        statusOverride: poi.currentStatus
          ? {
              val: poi.currentStatus.val,
              statusType: poi.currentStatus.statusType,
              expiresAt: poi.currentStatus.expiresAt
                ? new Date(poi.currentStatus.expiresAt).toISOString().slice(0, 16)
                : "",
            }
          : {
              val: 0,
              statusType: "crowd",
              expiresAt: "",
            },
      });
    }
  }, [poi, isOpen]);

  // 初始化地图
  useEffect(() => {
    if (!isOpen || amapLoading || !amap || !mapRef.current || !poi) {
      // 关闭对话框时清理地图
      if (!isOpen && mapInstanceRef.current) {
        if (markerRef.current) {
          markerRef.current.setMap(null);
          markerRef.current = null;
        }
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
      return;
    }

    // 如果地图实例已存在，只更新位置
    if (mapInstanceRef.current) {
      const centerLng = formData.lng || poi.lng;
      const centerLat = formData.lat || poi.lat;
      mapInstanceRef.current.setCenter([centerLng, centerLat]);
      if (markerRef.current) {
        markerRef.current.setPosition([centerLng, centerLat]);
      }
      return;
    }

    // 创建新地图实例
    const centerLng = formData.lng || poi.lng;
    const centerLat = formData.lat || poi.lat;
    const map = new amap.Map(mapRef.current, {
      zoom: 18,
      center: [centerLng, centerLat],
      viewMode: "3D",
      mapStyle: "amap://styles/normal",
    });

    mapInstanceRef.current = map;

    // 创建标记
    markerRef.current = new amap.Marker({
      position: [centerLng, centerLat],
      draggable: true,
    });
    markerRef.current.setMap(map);

    // 监听标记拖拽
    markerRef.current.on("dragend", (e: any) => {
      const { lng, lat } = e.lnglat;
      setFormData((prev) => ({ ...prev, lng, lat }));
    });

    // 监听地图点击（选点模式）
    const handleMapClick = (e: any) => {
      if (!isSelectingOnMap) return;
      const { lng, lat } = e.lnglat;
      setFormData((prev) => ({ ...prev, lng, lat }));
      if (markerRef.current) {
        markerRef.current.setPosition([lng, lat]);
      }
      setIsSelectingOnMap(false);
      toast.success("已选择位置");
    };

    map.on("click", handleMapClick);

    // 清理函数
    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off("click", handleMapClick);
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [amap, amapLoading, isOpen, poi, isSelectingOnMap, formData.lng, formData.lat]);

  // 保存 POI
  const handleSave = async () => {
    if (!poi) return;

    if (!formData.name.trim()) {
      toast.error("请输入 POI 名称");
      return;
    }

    if (!formData.categoryId) {
      toast.error("请选择分类");
      return;
    }

    setIsSaving(true);
    try {
      const updateBody: any = {
        name: formData.name.trim(),
        alias: formData.alias?.trim() || null,
        categoryId: formData.categoryId,
        description: formData.description.trim() || null,
        imageUrl: formData.imageUrl || null,
        lat: formData.lat,
        lng: formData.lng,
        isOfficial: formData.isOfficial,
      };

      // 如果设置了状态覆盖
      if (formData.statusOverride.val > 0 && formData.statusOverride.expiresAt) {
        updateBody.statusOverride = {
          val: formData.statusOverride.val,
          statusType: formData.statusOverride.statusType,
          expiresAt: new Date(formData.statusOverride.expiresAt).toISOString(),
        };
      }

      const result = await updatePOI(poi.id, updateBody);

      if (!result.success) {
        throw new Error(result.error || "更新失败");
      }

      toast.success("POI 更新成功");
      onSave();
      onClose();
    } catch (error) {
      console.error("更新 POI 失败:", error);
      toast.error(error instanceof Error ? error.message : "更新失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

  // 删除 POI
  const handleDelete = async () => {
    if (!poi) return;
    if (!confirm("确定要删除这个 POI 吗？此操作无法撤销。")) return;

    setIsDeleting(true);
    try {
      const result = await deletePOI(poi.id);

      if (!result.success) {
        throw new Error(result.error || "删除失败");
      }

      toast.success("POI 已删除");
      onClose();
      onSave();
    } catch (error) {
      console.error("删除 POI 失败:", error);
      toast.error(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !poi) return null;

  return (
    <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
      <div className="modal-container max-w-4xl">
        {/* 头部 */}
        <div className="modal-header flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900">编辑 POI</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容（可滚动） */}
        <div className="modal-body p-6 scrollbar-gutter-stable">
          {/* 基本信息 */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">基本信息</h3>
            <div className="space-y-5">
              {/* POI 名称 + 别称：两列布局 */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    POI 名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：第一食堂"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    别称 (Alias)
                  </label>
                  <input
                    type="text"
                    value={formData.alias ?? ""}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value || null })}
                    placeholder="例如：老图, 南门（逗号分隔）"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  />
                </div>
              </div>

              {/* 分类 */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  分类 <span className="text-red-500">*</span>
                </label>
              {isLoadingCategories ? (
                <div className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-500">
                  加载分类中...
                </div>
              ) : categoryGroups.regular.length + categoryGroups.convenience.length === 0 ? (
                <div className="w-full rounded-lg border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm text-orange-700">
                  暂无分类，请先前往「分类管理」创建分类
                </div>
              ) : (
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">请选择分类</option>
                  {categoryGroups.regular.length > 0 && (
                    <optgroup label="常规分类">
                      {categoryGroups.regular.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {categoryGroups.convenience.length > 0 && (
                    <optgroup label="便民公共设施">
                      {categoryGroups.convenience.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
              </div>
            </div>
          </section>

          {/* 媒体与描述 */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">媒体与描述</h3>
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">主图</label>
                <ImageUpload
                  value={formData.imageUrl ?? ""}
                  onChange={(url) =>
                    setFormData((prev) => ({ ...prev, imageUrl: url || null }))
                  }
                  onUploading={setIsImageUploading}
                  uploadFn={uploadPOIImage}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="可选：POI 的详细描述，如开放时间、注意事项等"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                />
              </div>
            </div>
          </section>

          {/* 地理坐标 */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">地理坐标</h3>
            <div className="space-y-5">

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">经度</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.lng}
                    onChange={(e) =>
                      setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">纬度</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.lat}
                    onChange={(e) =>
                      setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  />
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsSelectingOnMap(true)}
                  className="flex items-center gap-2 rounded-lg border border-[#FF4500]/40 bg-[#FFE5DD] px-4 py-2.5 text-sm font-medium text-[#FF4500] transition-colors hover:bg-[#FFE5DD]/80"
                >
                  <MapPin className="h-4 w-4" />
                  {isSelectingOnMap ? "点击地图选择位置..." : "在地图上拾取坐标"}
                </button>
                {isSelectingOnMap && (
                  <p className="mt-2 text-xs text-[#FF4500]">请在地图上点击要设置的位置</p>
                )}
              </div>

              <div className="h-64 w-full overflow-hidden rounded-lg border border-gray-200">
                {amapLoading ? (
                  <div className="flex h-full items-center justify-center bg-gray-100">
                    <p className="text-sm text-gray-600">加载地图中...</p>
                  </div>
                ) : (
                  <div ref={mapRef} className="h-full w-full" />
                )}
              </div>
            </div>
          </section>

          {/* 状态管理 */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">状态管理（可选）</h3>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">拥挤状态</label>
                <select
                  value={formData.statusOverride.val}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      statusOverride: {
                        ...formData.statusOverride,
                        val: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="0">不覆盖</option>
                  <option value="1">空闲</option>
                  <option value="2">正常</option>
                  <option value="3">拥挤</option>
                  <option value="4">爆满</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">有效期至</label>
                <input
                  type="datetime-local"
                  value={formData.statusOverride.expiresAt}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      statusOverride: {
                        ...formData.statusOverride,
                        expiresAt: e.target.value,
                      },
                    })
                  }
                  disabled={formData.statusOverride.val === 0}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          {/* 类型标记 */}
          <section>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">类型标记</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isOfficial}
                  onChange={(e) => setFormData({ ...formData, isOfficial: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-[#FF4500] focus:ring-2 focus:ring-[#FF4500]/20"
                />
                <span className="text-sm text-gray-700">官方创建</span>
              </label>
              <span className="text-xs text-gray-500">
                {formData.isOfficial
                  ? "该 POI 由管理员创建"
                  : "该 POI 由用户众包创建"}
              </span>
            </div>
          </section>
        </div>

        {/* 底部操作按钮（固定） */}
        <div className="modal-footer flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4">
          <div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSaving || isDeleting}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  删除
                </>
              )}
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isImageUploading || isDeleting || !formData.name.trim() || !formData.categoryId}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

