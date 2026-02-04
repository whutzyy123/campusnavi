"use client";

import { useState, useEffect, useRef } from "react";
import { X, MapPin, Save, Loader2 } from "lucide-react";
import { useAMap } from "@/hooks/use-amap";
import { CoordinateConverter } from "@/lib/amap-loader";
import toast from "react-hot-toast";
import type { MergedCategory } from "@/lib/category-utils";

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

  const [categories, setCategories] = useState<MergedCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    description: "",
    lat: 0,
    lng: 0,
    isOfficial: false,
    statusOverride: {
      val: 0,
      statusType: "crowd",
      expiresAt: "",
    },
  });

  // 加载分类列表
  useEffect(() => {
    const fetchCategories = async () => {
      if (!schoolId) return;

      setIsLoadingCategories(true);
      try {
        const response = await fetch("/api/admin/categories");
        const data = await response.json();
        if (data.success) {
          setCategories(data.data || []);
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
        categoryId: poi.categoryId || "",
        description: poi.description || "",
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
        categoryId: formData.categoryId,
        description: formData.description.trim() || null,
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

      const response = await fetch(`/api/pois/${poi.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // 根据状态码显示不同的错误信息
        let errorMessage = data.message || "更新失败";
        if (response.status === 403) {
          errorMessage = data.message || "分类无效或无权使用，请检查分类选择";
        } else if (response.status === 404) {
          errorMessage = data.message || "分类不存在，请刷新页面后重试";
        }
        throw new Error(errorMessage);
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

  if (!isOpen || !poi) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900">编辑 POI</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">基本信息</h3>

            {/* POI 名称 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                POI 名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：第一食堂"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* 分类 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                分类 <span className="text-red-500">*</span>
              </label>
              {isLoadingCategories ? (
                <div className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-500">
                  加载分类中...
                </div>
              ) : categories.length === 0 ? (
                <div className="w-full rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700">
                  暂无分类，请先前往"分类管理"创建分类
                </div>
              ) : (
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">请选择分类</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {cat.isGlobal ? "(系统默认)" : "(学校自定义)"}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 描述 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="可选：POI 的详细描述"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* 地理坐标 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">地理坐标</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">经度</label>
                <input
                  type="number"
                  step="any"
                  value={formData.lng}
                  onChange={(e) =>
                    setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">纬度</label>
                <input
                  type="number"
                  step="any"
                  value={formData.lat}
                  onChange={(e) =>
                    setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            {/* 地图拾取 */}
            <div>
              <button
                type="button"
                onClick={() => setIsSelectingOnMap(true)}
                className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                <MapPin className="h-4 w-4" />
                {isSelectingOnMap ? "点击地图选择位置..." : "在地图上拾取坐标"}
              </button>
              {isSelectingOnMap && (
                <p className="mt-2 text-xs text-blue-600">请在地图上点击要设置的位置</p>
              )}
            </div>

            {/* 地图容器 */}
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

          {/* 状态管理 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">状态管理（可选）</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">拥挤状态</label>
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
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="0">不覆盖</option>
                  <option value="1">空闲</option>
                  <option value="2">正常</option>
                  <option value="3">拥挤</option>
                  <option value="4">爆满</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">有效期至</label>
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
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* 类型标记 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">类型标记</h3>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isOfficial}
                  onChange={(e) => setFormData({ ...formData, isOfficial: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
                />
                <span className="text-sm text-gray-700">官方创建</span>
              </label>
              <span className="text-xs text-gray-500">
                {formData.isOfficial
                  ? "该 POI 由管理员创建"
                  : "该 POI 由用户众包创建"}
              </span>
            </div>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formData.name.trim() || !formData.categoryId}
              className="flex items-center justify-center gap-2 flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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

