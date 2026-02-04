"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAMap } from "@/hooks/use-amap";
import { useSchoolStore } from "@/store/use-school-store";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { POIManagerTable } from "@/components/poi-manager-table";
import { Card } from "@/components/card";
import { CoordinateConverter } from "@/lib/amap-loader";
import toast from "react-hot-toast";
import { X, Save, MapPin, Eye } from "lucide-react";
import type { POICategory } from "@/lib/poi-utils";

/**
 * 管理员 POI 录入页面
 * 功能：在已定义的校区内点击地图添加 POI
 */
export default function POIManagementPage() {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const boundaryPolygonRef = useRef<any>(null);
  const poiMarkersRef = useRef<any[]>([]);
  const { amap, loading, error } = useAMap();
  const { activeSchool, schools, setActiveSchool } = useSchoolStore();
  const { currentUser } = useAuthStore();

  // 是否处于“在地图上选点以添加 POI”的模式
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);

  // 强制租户锁定：管理员/工作人员必须使用 currentUser.schoolId
  useEffect(() => {
    const loadLockedSchool = async () => {
      if (!currentUser?.schoolId) {
        // 如果没有 schoolId，清空 activeSchool，避免显示错误数据
        if (activeSchool) {
          setActiveSchool(null);
        }
        return;
      }

      // 如果已经加载了正确的学校，不需要重复加载
      if (activeSchool?.id === currentUser.schoolId) {
        return;
      }

      try {
        const response = await fetch(`/api/schools/${currentUser.schoolId}`);
        const data = await response.json();
        if (data.success && data.school) {
          setActiveSchool(data.school);
        } else {
          console.error("加载锁定学校失败:", data.message);
        }
      } catch (error) {
        console.error("加载锁定学校失败:", error);
      }
    };

    loadLockedSchool();
  }, [currentUser?.schoolId]); // 移除 setActiveSchool 和 activeSchool 依赖，避免无限循环

  // 刷新键（用于强制刷新表格）
  const [refreshKey, setRefreshKey] = useState(0);

  // 表单状态
  const [selectedSchool, setSelectedSchool] = useState<string>(currentUser?.schoolId || "");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    description: "",
    lat: 0,
    lng: 0,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 动态分类列表
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  // 加载分类列表
  useEffect(() => {
    const fetchCategories = async () => {
      if (!currentUser?.schoolId) {
        setCategories([]);
        setIsLoadingCategories(false);
        return;
      }

      setIsLoadingCategories(true);
      try {
        const response = await fetch("/api/admin/categories");
        
        // 检查响应状态
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        // 防御性检查：确保返回格式正确
        if (result.success && Array.isArray(result.data)) {
          setCategories(result.data);
          // 如果有分类且表单中未选择，默认选择第一个
          if (result.data.length > 0 && !formData.categoryId) {
            setFormData((prev) => ({ ...prev, categoryId: result.data[0].id }));
          }
        } else {
          // API 返回格式不正确，设置为空数组
          setCategories([]);
          console.error("API 返回格式不正确:", result);
          if (result.message) {
            toast.error(result.message);
          }
        }
      } catch (error) {
        // 网络错误或其他异常，设置为空数组
        setCategories([]);
        console.error("获取分类列表失败:", error);
        toast.error("获取分类列表失败");
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [currentUser?.schoolId]);

  // 初始化地图 & 点击选点逻辑
  useEffect(() => {
    if (!amap || !mapRef.current) {
      return;
    }

    // 若地图尚未创建，则创建地图实例
    if (!mapInstanceRef.current) {
      const center: [number, number] = activeSchool
        ? [activeSchool.centerLng, activeSchool.centerLat]
        : [116.397428, 39.90923]; // 默认：北京

      const map = new amap.Map(mapRef.current, {
        zoom: activeSchool ? 15 : 13,
        center,
        viewMode: "3D",
        mapStyle: "amap://styles/normal",
      });

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // 地图点击事件：仅在"选点模式"下才生效
    const handleMapClick = (e: any) => {
      if (!isSelectingOnMap) {
        return;
      }

      const { lng, lat } = e.lnglat;
      setFormData({
        name: "",
        categoryId: (categories?.length ?? 0) > 0 ? categories[0].id : "",
        description: "",
        lat,
        lng,
      });
      setSelectedSchool(activeSchool?.id || "");
      setShowForm(true);
      // 选点完成后退出选点模式
      setIsSelectingOnMap(false);
      toast.success("已选择位置，请填写 POI 信息");
    };

    // 每次 effect 运行时，先移除旧的点击事件，再绑定新的，保证使用最新逻辑
    map.off("click", handleMapClick);
    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [amap, activeSchool, isSelectingOnMap]);

  // 兜底：在地图容器上添加一个透明覆盖层做点击拾取，避免地图内部事件被其他图层吞掉
  const handleMapOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectingOnMap || !mapInstanceRef.current) {
      return;
    }

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    try {
      const lngLat = mapInstanceRef.current.containerToLngLat([offsetX, offsetY]);

      if (!lngLat) return;

      const { lng, lat } = lngLat;
      setFormData({
        name: "",
        categoryId: (categories?.length ?? 0) > 0 ? categories[0].id : "",
        description: "",
        lat,
        lng,
      });
      setSelectedSchool(activeSchool?.id || "");
      setShowForm(true);
      setIsSelectingOnMap(false);
      toast.success("已选择位置，请填写 POI 信息");
    } catch (err) {
      console.error("地图坐标转换失败:", err);
    }
  };

  // 确保 selectedSchool 始终使用锁定学校或 activeSchool
  useEffect(() => {
    if (currentUser?.schoolId && currentUser.schoolId !== selectedSchool) {
      setSelectedSchool(currentUser.schoolId);
    } else if (activeSchool?.id && activeSchool.id !== selectedSchool && !currentUser?.schoolId) {
      // 只有在没有锁定 schoolId 的情况下才使用 activeSchool
      setSelectedSchool(activeSchool.id);
    }
  }, [currentUser?.schoolId, activeSchool?.id]); // 移除 selectedSchool 依赖，避免无限循环

  // 绘制学校边界
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !activeSchool) {
      return;
    }

    const boundary = activeSchool.boundary as any;
    if (!boundary || boundary.type !== "Polygon") {
      return;
    }

    if (boundaryPolygonRef.current) {
      mapInstanceRef.current.remove(boundaryPolygonRef.current);
    }

    const coordinates = boundary.coordinates[0];
    boundaryPolygonRef.current = new amap.Polygon({
      path: coordinates,
      strokeColor: "#1890ff",
      strokeWeight: 2,
      strokeOpacity: 0.8,
      fillColor: "#1890ff",
      fillOpacity: 0.1,
    });

    boundaryPolygonRef.current.setMap(mapInstanceRef.current);
    mapInstanceRef.current.panTo([activeSchool.centerLng, activeSchool.centerLat]);

    return () => {
      if (boundaryPolygonRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(boundaryPolygonRef.current);
        boundaryPolygonRef.current = null;
      }
    };
  }, [amap, activeSchool]);

  // 在地图上渲染当前学校的 POI 标记
  useEffect(() => {
    const loadAndRenderPOIs = async () => {
      if (!amap || !mapInstanceRef.current || !activeSchool) {
        return;
      }

      try {
        const response = await fetch(`/api/pois?schoolId=${activeSchool.id}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          console.error("加载地图 POI 失败:", data.message);
          return;
        }

        // 清除旧的 Marker
        if (poiMarkersRef.current.length > 0) {
          poiMarkersRef.current.forEach((marker) => {
            try {
              marker.setMap(null);
            } catch {}
          });
          poiMarkersRef.current = [];
        }

        // 创建新的 Marker（使用简洁现代的圆点样式）
        const getMarkerColor = (category: string) => {
          switch (category) {
            case "餐饮":
              return "#ff6b6b";
            case "教学":
              return "#4ecdc4";
            case "办公":
              return "#45b7d1";
            case "快递":
              return "#f9ca24";
            case "运动":
              return "#6c5ce7";
            default:
              return "#3498db";
          }
        };

        const markers: any[] = data.pois.map((poi: any) => {
          const color = getMarkerColor(poi.category);
          const content = `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 0 6px rgba(0,0,0,0.25);"></div>`;

          return new amap.Marker({
            position: [poi.lng, poi.lat],
            title: poi.name,
            offset: new amap.Pixel(-8, -8),
            content,
            zIndex: 100,
          });
        });

        markers.forEach((marker) => {
          marker.setMap(mapInstanceRef.current);
        });

        poiMarkersRef.current = markers;
      } catch (err) {
        console.error("加载地图 POI 失败:", err);
      }
    };

    loadAndRenderPOIs();
  }, [amap, activeSchool, refreshKey]);

  // 保存 POI
  const handleSave = async () => {
    if (!formData.name.trim() || !selectedSchool) {
      setSaveMessage({ type: "error", text: "请填写 POI 名称并选择学校" });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/pois", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolId: selectedSchool,
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          lat: formData.lat,
          lng: formData.lng,
          description: formData.description.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 根据状态码显示不同的错误信息
        let errorMessage = data.message || "保存失败";
        if (response.status === 403) {
          errorMessage = data.message || "分类无效或无权使用，请检查分类选择";
        } else if (response.status === 404) {
          errorMessage = data.message || "分类不存在，请刷新页面后重试";
        }
        throw new Error(errorMessage);
      }

      setSaveMessage({ type: "success", text: "POI 创建成功！" });
      toast.success("POI 创建成功！");
      setTimeout(() => {
        setShowForm(false);
        setFormData({ name: "", categoryId: (categories?.length ?? 0) > 0 ? categories[0].id : "", description: "", lat: 0, lng: 0 });
        handlePOISaved(); // 刷新表格
      }, 1500);
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "保存失败，请重试",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="mb-4 text-lg font-medium text-gray-700">加载地图中...</div>
          <div className="h-2 w-64 rounded-full bg-gray-200">
            <div className="h-2 animate-pulse rounded-full bg-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-red-50">
        <div className="text-center">
          <X className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <p className="text-lg font-medium text-red-600">地图加载失败</p>
          <p className="mt-2 text-sm text-red-500">{error.message}</p>
        </div>
      </div>
    );
  }

  // 处理新增 POI
  const handleAddPOI = () => {
    if (!activeSchool) {
      toast.error("请先选择学校");
      return;
    }
    // 进入“在地图上选点”模式，让用户先在地图上选择位置
    setIsSelectingOnMap(true);
    toast.success("请在地图上点击要添加 POI 的位置");
  };

  // 处理保存成功后的刷新
  const handlePOISaved = () => {
    // 触发表格刷新
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <AuthGuard requiredRole="ADMIN" requireSchoolId={true}>
      <AdminLayout>
        <div className="p-6 pb-24">
          {/* POI 管理表格 */}
          {currentUser?.schoolId && (
            <POIManagerTable
              key={`poi-table-${refreshKey}`}
              schoolId={currentUser.schoolId}
              refreshKey={refreshKey}
              onAddPOI={handleAddPOI}
              onDeletePOI={async (poiId) => {
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
                  if (data.success) {
                    toast.success("POI 删除成功");
                    handlePOISaved(); // 刷新表格
                  } else {
                    throw new Error(data.message || "删除失败");
                  }
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "删除失败");
                }
              }}
            />
          )}

          {/* 地图视图（可选，用于可视化添加 POI） */}
          <div className="mt-6">
            <Card title="地图视图" description="点击地图添加 POI">
              <div className="relative h-[600px] w-full overflow-hidden rounded-lg border border-gray-200">
                <div ref={mapRef} className="h-full w-full" />

                {/* 选点模式下的透明覆盖层，兜底处理点击拾取 */}
                {isSelectingOnMap && (
                  <div
                    className="absolute inset-0 z-20 cursor-crosshair"
                    onClick={handleMapOverlayClick}
                  />
                )}
                
                {/* 地图加载状态 */}
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80">
                    <div className="text-center">
                      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
                      <p className="text-sm text-gray-600">加载地图中...</p>
                    </div>
                  </div>
                )}

                {/* 地图错误状态 */}
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-50/80">
                    <div className="text-center">
                      <X className="mx-auto mb-4 h-12 w-12 text-red-500" />
                      <p className="text-lg font-medium text-red-600">地图加载失败</p>
                      <p className="mt-2 text-sm text-red-500">{error.message}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

      {/* POI 录入表单弹窗 */}
      {showForm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">添加 POI</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
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
                ) : (categories?.length ?? 0) === 0 ? (
                  <div className="w-full rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700">
                    暂无分类，请先前往"分类管理"创建分类
                  </div>
                ) : (
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    disabled={isLoadingCategories || (categories?.length ?? 0) === 0}
                  >
                    {categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    )) ?? []}
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

              {/* 坐标信息 */}
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>
                    坐标：{formData.lng.toFixed(6)}, {formData.lat.toFixed(6)}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formData.name.trim() || !selectedSchool || !formData.categoryId || isLoadingCategories || (categories?.length ?? 0) === 0}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>
              </div>

              {/* 消息提示 */}
              {saveMessage && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    saveMessage.type === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {saveMessage.text}
                </div>
              )}
            </div>
          </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

