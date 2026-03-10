"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useAMap } from "@/hooks/use-amap";
import { useSchoolStore } from "@/store/use-school-store";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { POIManagerTable } from "@/components/poi-manager-table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { createPOI, deletePOI, getPOIsBySchool } from "@/lib/poi-actions";
import { getSchoolById, getCampuses } from "@/lib/school-actions";
import { getSchoolCategoriesForAdmin } from "@/lib/category-actions";
import toast from "react-hot-toast";
import { X, MapPin, Plus } from "lucide-react";
import { Select } from "@/components/ui/select";
/**
 * 管理员 POI 录入页面
 * 功能：在已定义的校区内点击地图添加 POI
 */
export default function POIManagementPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const boundaryPolygonRef = useRef<any>(null);
  const poiMarkersRef = useRef<any[]>([]);
  const previewMarkerRef = useRef<any>(null); // 选点时的临时红色预览标记
  const parentMarkerRef = useRef<any>(null); // 添加二级点时父 POI 的灰色参考标记
  const infoWindowRef = useRef<any>(null); // POI 信息窗体
  const isPickingLocationRef = useRef(false); // 供 Marker 点击回调读取当前选点状态
  const { amap, loading, error } = useAMap();
  const { activeSchool, setActiveSchool } = useSchoolStore();
  const { currentUser } = useAuthStore();

  // 是否处于“在地图上选点”模式（支持缩放平移，点击即确定）
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  // 地图 Marker 点击触发的编辑 POI（传递给 POIManagerTable 打开编辑弹窗）
  const [mapClickEditPOI, setMapClickEditPOI] = useState<any>(null);

  useEffect(() => {
    isPickingLocationRef.current = isPickingLocation;
  }, [isPickingLocation]);

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
        const result = await getSchoolById(currentUser.schoolId);
        if (result.success && result.data) {
          const school = result.data;
          setActiveSchool({
            id: school.id,
            name: school.name,
            schoolCode: school.schoolCode,
            centerLng: school.centerLng,
            centerLat: school.centerLat,
          });
        } else {
          console.error("加载锁定学校失败:", result.success === false ? result.error : "未知错误");
        }
      } catch (error) {
        console.error("加载锁定学校失败:", error);
      }
    };

    loadLockedSchool();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeSchool?.id 足够，避免引用变化触发地图重复初始化
  }, [currentUser?.schoolId]);

  // 刷新键（用于强制刷新表格）
  const [refreshKey, setRefreshKey] = useState(0);

  // 表单状态
  const [selectedSchool, setSelectedSchool] = useState<string>(currentUser?.schoolId || "");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    alias: "" as string | null,
    categoryId: "",
    description: "",
    lat: 0,
    lng: 0,
    parentId: null as string | null,
  });
  const [parentPOI, setParentPOI] = useState<{ id: string; name: string; lat: number; lng: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 动态分类列表（分组：常规 + 便民公共设施）
  const [categoryGroups, setCategoryGroups] = useState<{
    regular: Array<{ id: string; name: string }>;
    convenience: Array<{ id: string; name: string }>;
  }>({ regular: [], convenience: [] });
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  // 加载分类列表（常规 + 便民公共设施，分组）
  useEffect(() => {
    const fetchCategories = async () => {
      if (!currentUser?.schoolId) {
        setCategoryGroups({ regular: [], convenience: [] });
        setIsLoadingCategories(false);
        return;
      }

      setIsLoadingCategories(true);
      try {
        const result = await getSchoolCategoriesForAdmin(currentUser.schoolId, {
          all: true,
          grouped: true,
        });

        if (result.success && result.data && typeof result.data === "object") {
          const data = result.data as { regular?: Array<{ id: string; name: string }>; convenience?: Array<{ id: string; name: string }> };
          const regular = data.regular ?? [];
          const convenience = data.convenience ?? [];
          setCategoryGroups({ regular, convenience });
          const firstRegular = regular[0];
          const firstConvenience = convenience[0];
          setFormData((prev) => {
            if (prev.categoryId) return prev;
            const firstId = firstRegular?.id ?? firstConvenience?.id;
            return firstId ? { ...prev, categoryId: firstId } : prev;
          });
        } else {
          setCategoryGroups({ regular: [], convenience: [] });
          if (result.error) toast.error(result.error);
        }
      } catch (error) {
        setCategoryGroups({ regular: [], convenience: [] });
        console.error("获取分类列表失败:", error);
        toast.error("获取分类列表失败");
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [currentUser?.schoolId]);

  // 初始化地图（仅创建一次）
  useEffect(() => {
    if (!amap || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [116.397428, 39.90923];
      const hasSchoolCenter =
        activeSchool?.centerLng != null &&
        activeSchool?.centerLat != null &&
        !isNaN(activeSchool.centerLng) &&
        !isNaN(activeSchool.centerLat);
      const center: [number, number] = hasSchoolCenter
        ? [activeSchool!.centerLng!, activeSchool!.centerLat!]
        : defaultCenter;

      const map = new amap.Map(mapRef.current, {
        zoom: hasSchoolCenter ? 16 : 13,
        center,
        viewMode: "3D",
        mapStyle: "amap://styles/normal",
      });

      mapInstanceRef.current = map;
    }
  }, [amap, activeSchool]);

  // 选点模式：地图点击监听（使用原生 DOM 事件，因 AMap map.on('click') 在此环境下可能不触发）
  useEffect(() => {
    const mapInstance = mapInstanceRef.current;
    const container = mapRef.current;
    if (!mapInstance || !amap || !isPickingLocation || !container) return;

    const handleDomClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pixelX = e.clientX - rect.left;
      const pixelY = e.clientY - rect.top;
      if (pixelX < 0 || pixelY < 0 || pixelX > rect.width || pixelY > rect.height) return;

      const lnglat = mapInstance.containerToLngLat(new amap.Pixel(pixelX, pixelY));
      const lng = typeof lnglat?.getLng === "function" ? lnglat.getLng() : (lnglat as { lng: number }).lng;
      const lat = typeof lnglat?.getLat === "function" ? lnglat.getLat() : (lnglat as { lat: number }).lat;

      // 移除旧的预览标记
      if (previewMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(previewMarkerRef.current);
        previewMarkerRef.current = null;
      }

      // 放置红色预览标记
      const content = `<div style="width:20px;height:20px;border-radius:9999px;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`;
      const marker = new amap.Marker({
        position: [lng, lat],
        content,
        offset: new amap.Pixel(-10, -10),
        zIndex: 200,
      });
      marker.setMap(mapInstanceRef.current!);
      previewMarkerRef.current = marker;

      // 填充表单并切换到表单视图
      const firstCategoryId =
        categoryGroups.regular[0]?.id ?? categoryGroups.convenience[0]?.id ?? "";
      setFormData((prev) => ({
        ...prev,
        lat,
        lng,
        name: prev.name || "",
        categoryId: prev.categoryId || firstCategoryId,
        description: prev.description || "",
        parentId: prev.parentId ?? null,
      }));
      setSelectedSchool(activeSchool?.id || "");
      setShowForm(true);
      setIsPickingLocation(false);
      toast.success("已选择位置，请填写 POI 信息");
    };

    container.addEventListener("click", handleDomClick);
    return () => {
      container.removeEventListener("click", handleDomClick);
    };
  }, [isPickingLocation, amap, activeSchool, categoryGroups]);

  // 关闭表单或取消选点时移除预览标记
  useEffect(() => {
    if (!showForm && !isPickingLocation && previewMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.remove(previewMarkerRef.current);
      previewMarkerRef.current = null;
    }
  }, [showForm, isPickingLocation]);

  // 选点模式下若有 parentPOI，在地图上渲染灰色父 POI 参考标记
  useEffect(() => {
    if (!amap || !mapInstanceRef.current) return;

    if (parentMarkerRef.current) {
      mapInstanceRef.current.remove(parentMarkerRef.current);
      parentMarkerRef.current = null;
    }

    if (isPickingLocation && parentPOI) {
      const content = `<div style="width:16px;height:16px;border-radius:9999px;background:#9ca3af;border:2px solid #e5e7eb;opacity:0.8;"></div>`;
      const marker = new amap.Marker({
        position: [parentPOI.lng, parentPOI.lat],
        title: parentPOI.name + "（父级参考）",
        offset: new amap.Pixel(-8, -8),
        content,
        zIndex: 150,
      });
      marker.setMap(mapInstanceRef.current);
      parentMarkerRef.current = marker;
    }

    return () => {
      if (parentMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(parentMarkerRef.current);
        parentMarkerRef.current = null;
      }
    };
  }, [amap, isPickingLocation, parentPOI]);

  // 确保 selectedSchool 始终使用锁定学校或 activeSchool
  useEffect(() => {
    if (currentUser?.schoolId && currentUser.schoolId !== selectedSchool) {
      setSelectedSchool(currentUser.schoolId);
    } else if (activeSchool?.id && activeSchool.id !== selectedSchool && !currentUser?.schoolId) {
      // 只有在没有锁定 schoolId 的情况下才使用 activeSchool
      setSelectedSchool(activeSchool.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedSchool 为同步目标，加入会导致循环
  }, [currentUser?.schoolId, activeSchool?.id]);

  // 学校中心定位：activeSchool 加载后立即 setZoomAndCenter(16)
  useEffect(() => {
    if (
      !mapInstanceRef.current ||
      !activeSchool ||
      activeSchool.centerLng == null ||
      activeSchool.centerLat == null ||
      isNaN(activeSchool.centerLng) ||
      isNaN(activeSchool.centerLat)
    ) {
      return;
    }
    const center: [number, number] = [activeSchool.centerLng, activeSchool.centerLat];
    mapInstanceRef.current.setZoomAndCenter(16, center);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeSchool 属性已拆分为 id/centerLng/centerLat，避免引用变化触发地图闪烁
  }, [activeSchool?.id, activeSchool?.centerLng, activeSchool?.centerLat]);

  // 绘制校区边界（从 CampusArea 加载，替代原 School.boundary）
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !activeSchool) {
      return;
    }

    const fetchAndDrawCampuses = async () => {
      try {
        const result = await getCampuses(activeSchool.id);
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
          const fallbackCenter: [number, number] =
            activeSchool.centerLng != null && activeSchool.centerLat != null
              ? [activeSchool.centerLng, activeSchool.centerLat]
              : [116.397428, 39.90923];
          mapInstanceRef.current?.setZoomAndCenter(16, fallbackCenter);
          return;
        }

        if (boundaryPolygonRef.current) {
          mapInstanceRef.current.remove(boundaryPolygonRef.current);
          boundaryPolygonRef.current = null;
        }

        const campuses = result.data as Array<{ boundary: unknown; center: [number, number] }>;
        const first = campuses[0];
        const boundary = first.boundary as { type?: string; coordinates?: unknown[][] } | null;
        if (boundary?.type === "Polygon" && Array.isArray(boundary.coordinates?.[0])) {
          boundaryPolygonRef.current = new amap.Polygon({
            path: boundary.coordinates[0],
            strokeColor: "#1890ff",
            strokeWeight: 2,
            strokeOpacity: 0.8,
            fillColor: "#1890ff",
            fillOpacity: 0.1,
          });
          boundaryPolygonRef.current.setMap(mapInstanceRef.current);
        }

        const center: [number, number] =
          first.center ??
          (activeSchool.centerLng != null && activeSchool.centerLat != null
            ? [activeSchool.centerLng, activeSchool.centerLat]
            : [116.397428, 39.90923]);
        mapInstanceRef.current.setZoomAndCenter(16, center);
      } catch (err) {
        console.error("加载校区边界失败:", err);
        const fallbackCenter: [number, number] =
          activeSchool.centerLng != null && activeSchool.centerLat != null
            ? [activeSchool.centerLng, activeSchool.centerLat]
            : [116.397428, 39.90923];
        mapInstanceRef.current?.setZoomAndCenter(16, fallbackCenter);
      }
    };

    fetchAndDrawCampuses();

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
        const result = await getPOIsBySchool(activeSchool.id);

        if (!result.success || !result.data?.pois) {
          console.error("加载地图 POI 失败:", result.error);
          return;
        }

        const data = { success: true, pois: result.data.pois };

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
          const content = `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 0 6px rgba(0,0,0,0.25);cursor:pointer;"></div>`;

          const marker = new amap.Marker({
            position: [poi.lng, poi.lat],
            title: poi.name,
            offset: new amap.Pixel(-8, -8),
            content,
            zIndex: 100,
          });

          marker.on("click", () => {
            if (isPickingLocationRef.current) return; // 选点模式下不打开编辑
            setMapClickEditPOI(poi);
            // 地图平移到选中 POI，便于用户确认位置
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo([poi.lng, poi.lat], false, 300);
              mapInstanceRef.current.setZoom(17);
            }
          });

          return marker;
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

  // 保存 POI（使用 Server Action，避免调用已删除的 /api/pois）
  const handleSave = async () => {
    if (!formData.name.trim() || !selectedSchool) {
      setSaveMessage({ type: "error", text: "请填写 POI 名称并选择学校" });
      return;
    }

    if (!formData.categoryId) {
      setSaveMessage({ type: "error", text: "请选择分类" });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const result = await createPOI({
        schoolId: selectedSchool,
        name: formData.name.trim(),
        alias: formData.alias?.trim() || null,
        categoryId: formData.categoryId,
        lat: formData.lat,
        lng: formData.lng,
        description: formData.description.trim() || null,
        parentId: formData.parentId || null,
      });

      if (!result.success) {
        toast.error(result.error || "POI 创建失败");
        setSaveMessage({ type: "error", text: result.error || "POI 创建失败，请重试" });
        return;
      }

      setSaveMessage({ type: "success", text: "POI 创建成功！" });
      toast.success("POI 创建成功！");
      setTimeout(() => {
        // 清除预览标记并重置到列表视图
        if (previewMarkerRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.remove(previewMarkerRef.current);
          previewMarkerRef.current = null;
        }
        setShowForm(false);
        setFormData({
          name: "",
          alias: null,
          categoryId:
            categoryGroups.regular[0]?.id ?? categoryGroups.convenience[0]?.id ?? "",
          description: "",
          lat: 0,
          lng: 0,
          parentId: null,
        });
        setParentPOI(null);
        handlePOISaved();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败，请重试";
      toast.error(message);
      setSaveMessage({ type: "error", text: message });
    } finally {
      setIsSaving(false);
    }
  };

  // 聚焦到 POI：地图 panTo + 打开信息窗体（必须在 early return 之前定义，遵守 Hooks 规则）
  const handleFocusPOI = useCallback(
    (poi: { name: string; lat: number; lng: number; category?: string; description?: string | null }) => {
      if (!amap || !mapInstanceRef.current) return;

      const position: [number, number] = [poi.lng, poi.lat];
      mapInstanceRef.current.panTo(position, false, 300);
      mapInstanceRef.current.setZoom(17);

      if (infoWindowRef.current) {
        infoWindowRef.current.close();
        infoWindowRef.current = null;
      }

      const content = `
        <div style="min-width:160px;padding:8px 12px;font-size:13px;">
          <div style="font-weight:600;color:#1a1a1b;margin-bottom:4px;">${poi.name}</div>
          ${poi.category ? `<div style="color:#7c7c7c;font-size:12px;">${poi.category}</div>` : ""}
          ${poi.description ? `<div style="color:#7c7c7c;margin-top:4px;font-size:12px;">${poi.description}</div>` : ""}
        </div>
      `;
      const infoWindow = new amap.InfoWindow({
        content,
        offset: new amap.Pixel(0, -30),
      });
      infoWindow.open(mapInstanceRef.current, position);
      infoWindowRef.current = infoWindow;
    },
    [amap]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="mb-4 text-lg font-medium text-gray-700">加载地图中...</div>
          <div className="h-2 w-64 rounded-full bg-gray-200">
            <div className="h-2 animate-pulse rounded-full bg-[#FF4500]"></div>
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

  // 处理新增 POI：进入选点模式（支持缩放平移，点击即确定）
  const handleAddPOI = () => {
    if (!activeSchool) {
      toast.error("请先选择学校");
      return;
    }
    setParentPOI(null);
    setFormData((prev) => ({ ...prev, parentId: null }));
    setIsPickingLocation(true);
    toast.success("请在地图上点击目标位置（支持缩放平移寻找）");
  };

  // 处理新增二级点：预填 parentId，进入选点模式，地图定位到父 POI
  const handleAddSubPOI = (poi: { id: string; name: string; lat: number; lng: number }) => {
    if (!activeSchool) return;
    setParentPOI(poi);
    setFormData((prev) => ({ ...prev, parentId: poi.id }));
    setIsPickingLocation(true);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([poi.lng, poi.lat], false, 300);
      mapInstanceRef.current.setZoom(17);
    }
    toast.success(`正在为「${poi.name}」添加二级点，请在地图上点击位置`);
  };

  // 处理保存成功后的刷新
  const handlePOISaved = () => {
    // 触发表格刷新
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <AuthGuard requiredRole="ADMIN" requireSchoolId={true}>
      <AdminLayout>
        <div className="flex h-full min-h-0 overflow-hidden">
          {/* 左侧面板：列表 / 新增表单 */}
          <div className="flex w-96 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
            {/* 固定头部：标题 + 新增按钮 */}
            <div className="shrink-0 border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">POI 列表</h2>
                {!showForm && (
                  <button
                    onClick={handleAddPOI}
                    className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF5500]"
                  >
                    <Plus className="h-4 w-4" />
                    新增 POI
                  </button>
                )}
              </div>
            </div>

            {/* 内容区：表单可滚动；列表为固定筛选 + 可滚动卡片 */}
            {showForm ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                      {parentPOI ? `正在为「${parentPOI.name}」添加二级点` : "添加 POI"}
                    </h3>
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setParentPOI(null);
                        setFormData((prev) => ({ ...prev, parentId: null }));
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      POI 名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例如：第一食堂"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      别称 (Alias)
                    </label>
                    <input
                      type="text"
                      value={formData.alias ?? ""}
                      onChange={(e) => setFormData({ ...formData, alias: e.target.value || null })}
                      placeholder="例如：老图, 南门 (多个别称请用逗号隔开)"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      分类 <span className="text-red-500">*</span>
                    </label>
                    {isLoadingCategories ? (
                      <div className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-500">
                        加载分类中...
                      </div>
                    ) : (categoryGroups.regular.length + categoryGroups.convenience.length) === 0 ? (
                      <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700">
                        暂无分类，请先前往「分类管理」创建
                      </div>
                    ) : (
                      <Select
                        value={formData.categoryId}
                        onValueChange={(v) => setFormData({ ...formData, categoryId: v })}
                        optionGroups={[
                          {
                            label: "常规分类",
                            options: categoryGroups.regular.map((c) => ({ value: c.id, label: c.name })),
                          },
                          {
                            label: "便民公共设施",
                            options: categoryGroups.convenience.map((c) => ({
                              value: c.id,
                              label: c.name,
                            })),
                          },
                        ].filter((g) => g.options.length > 0)}
                        placeholder="选择分类"
                        disabled={isLoadingCategories}
                        className="w-full"
                      />
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">描述</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="可选"
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                    />
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {formData.lng.toFixed(6)}, {formData.lat.toFixed(6)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setParentPOI(null);
                        setFormData((prev) => ({ ...prev, parentId: null }));
                      }}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={
                        isSaving ||
                        !formData.name.trim() ||
                        !selectedSchool ||
                        !formData.categoryId ||
                        isLoadingCategories ||
                        (categoryGroups.regular.length + categoryGroups.convenience.length) === 0
                      }
                      className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF5500] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>

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
            ) : currentUser?.schoolId ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <Suspense fallback={<LoadingSpinner />}>
                  <POIManagerTable
                  key={`poi-table-${refreshKey}`}
                  schoolId={currentUser.schoolId}
                  refreshKey={refreshKey}
                  onAddPOI={handleAddPOI}
                  onAddSubPOI={handleAddSubPOI}
                  onFocusPOI={handleFocusPOI}
                  onEditPOI={handlePOISaved}
                  triggerEditPOI={mapClickEditPOI}
                  onEditTriggered={() => setMapClickEditPOI(null)}
                  embedded
                  hierarchical
                  onDeletePOI={async (poiId) => {
                    try {
                      const result = await deletePOI(poiId);
                      if (result.success) {
                        toast.success("POI 删除成功");
                        handlePOISaved();
                      } else {
                        throw new Error(result.error || "删除失败");
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "删除失败");
                    }
                  }}
                />
                </Suspense>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                <p className="text-sm text-gray-500">请先选择学校</p>
              </div>
            )}
          </div>

          {/* 右侧地图：始终可见，选点模式下支持自由缩放平移 */}
          <div
            className={`relative z-0 min-h-0 flex-1 bg-gray-100 ${isPickingLocation ? "cursor-crosshair" : ""}`}
          >
            <div ref={mapRef} className="relative z-10 h-full w-full" />

            {isPickingLocation && (
              <div className="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2">
                <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-[#FF4500] bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-lg">
                  <span>
                    {parentPOI
                      ? `📍 正在为「${parentPOI.name}」添加二级点，请在地图上点击位置`
                      : "📍 请在地图上点击目标位置 (支持缩放平移寻找)"}
                  </span>
                  <button
                    onClick={() => {
                      setIsPickingLocation(false);
                      setParentPOI(null);
                      setFormData((prev) => ({ ...prev, parentId: null }));
                    }}
                    className="rounded px-2 py-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80">
                <div className="text-center">
                  <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent" />
                  <p className="text-sm text-gray-600">加载地图中...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-50/80">
                <div className="text-center">
                  <X className="mx-auto mb-4 h-12 w-12 text-red-500" />
                  <p className="text-lg font-medium text-red-600">地图加载失败</p>
                  <p className="mt-2 text-sm text-red-500">{String(error)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </AdminLayout>
    </AuthGuard>
  );
}

