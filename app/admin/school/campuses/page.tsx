"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAMap } from "@/hooks/use-amap";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { loadAMapPlugin } from "@/lib/amap-loader";
import toast from "react-hot-toast";
import {
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Save,
  X,
  Eye,
  Building2,
} from "lucide-react";

interface CampusArea {
  id: string;
  schoolId: string;
  name: string;
  boundary: any; // GeoJSON Polygon
  center: [number, number]; // [lng, lat]
  createdAt: string;
  updatedAt: string;
}

/**
 * 校区边界编辑器页面
 * 功能：支持多校区绘制、编辑、删除
 */
export default function CampusManagementPage() {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const { amap, loading, error } = useAMap();
  const { currentUser } = useAuthStore();
  const { activeSchool, setActiveSchool } = useSchoolStore();

  // 校区列表
  const [campuses, setCampuses] = useState<CampusArea[]>([]);
  const [isLoadingCampuses, setIsLoadingCampuses] = useState(true);

  // 地图绘制工具
  const mouseToolRef = useRef<any>(null);
  const polygonEditorRef = useRef<any>(null);
  const campusPolygonsRef = useRef<Map<string, any>>(new Map()); // 存储校区多边形实例
  const campusLabelsRef = useRef<Map<string, any>>(new Map()); // 存储校区标签实例
  const isEditingRef = useRef<boolean>(false); // 编辑锁定标志，防止 React 干扰
  const editingPolygonRef = useRef<any>(null); // 锁定正在编辑的多边形实例

  // 编辑状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [editingCampusId, setEditingCampusId] = useState<string | null>(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const [newCampusName, setNewCampusName] = useState("");
  const [newCampusBoundary, setNewCampusBoundary] = useState<[number, number][] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // 插件加载状态（与地图加载状态分离）
  const [isPluginsLoaded, setIsPluginsLoaded] = useState(false);
  const [isPluginsLoading, setIsPluginsLoading] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  // 获取目标学校ID（超级管理员可以选择，其他角色使用当前用户的学校）
  const getTargetSchoolId = useCallback(() => {
    if (currentUser?.role === "SUPER_ADMIN") {
      // 超级管理员需要从 activeSchool 或查询参数获取
      return activeSchool?.id || null;
    }
    return currentUser?.schoolId || null;
  }, [currentUser, activeSchool]);

  // 加载校区列表
  const fetchCampuses = useCallback(async () => {
    const schoolId = getTargetSchoolId();
    if (!schoolId) {
      setIsLoadingCampuses(false);
      return;
    }

    setIsLoadingCampuses(true);
    try {
      const url = currentUser?.role === "SUPER_ADMIN"
        ? `/api/admin/campuses?schoolId=${schoolId}`
        : "/api/admin/campuses";
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setCampuses(data.data || []);
      } else {
        toast.error(data.message || "加载校区列表失败");
      }
    } catch (error) {
      console.error("加载校区列表失败:", error);
      toast.error("加载校区列表失败");
    } finally {
      setIsLoadingCampuses(false);
    }
  }, [getTargetSchoolId, currentUser?.role]);

  useEffect(() => {
    fetchCampuses();
  }, [fetchCampuses]);

  // 强制租户锁定：管理员/工作人员必须使用 currentUser.schoolId 加载学校信息
  useEffect(() => {
    const loadLockedSchool = async () => {
      // 超级管理员需要手动选择学校，不需要自动加载
      if (currentUser?.role === "SUPER_ADMIN") {
        return;
      }

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
  }, [currentUser?.schoolId, currentUser?.role, activeSchool?.id, setActiveSchool]);

  // 异步加载插件函数（不阻塞主线程）
  const loadPluginsSequentially = useCallback(async (map: any) => {
    if (!amap) {
      return;
    }

    setIsPluginsLoading(true);
    
    try {
      // 检查插件是否已经在主加载器中加载（可能已经可用）
      const checkPluginsAvailable = () => {
        try {
          return amap.MouseTool && amap.PolygonEditor;
        } catch {
          return false;
        }
      };

      // 如果插件已经可用，直接使用
      if (checkPluginsAvailable()) {
        mouseToolRef.current = new amap.MouseTool(map);
        setIsPluginsLoaded(true);
        setIsPluginsLoading(false);
        return;
      }

      // 依次加载插件，避免 Promise.all 导致的阻塞
      // 注意：这些插件可能已经在主加载器中加载，loadAMapPlugin 会检测并直接返回
      await loadAMapPlugin("AMap.MouseTool");
      await loadAMapPlugin("AMap.PolygonEditor");

      // 再次检查插件是否已加载
      if (checkPluginsAvailable()) {
        mouseToolRef.current = new amap.MouseTool(map);
        setIsPluginsLoaded(true);
      } else {
        console.warn("插件加载警告：MouseTool 或 PolygonEditor 可能未完全加载，但地图仍可使用");
        // 不显示错误提示，因为地图本身可以正常使用
      }
    } catch (error) {
      console.warn("加载地图插件警告:", error);
      // 不显示错误提示，因为插件可能已经在主加载器中加载，只是检测时机问题
      // 地图本身可以正常使用，只是编辑功能可能暂时不可用
    } finally {
      setIsPluginsLoading(false);
    }
  }, [amap]);

  // 初始化地图（优先渲染地图，插件异步加载）
  // 关键修复：确保 activeSchool 加载完成后再初始化地图
  useEffect(() => {
    // 如果地图 SDK 还在加载中，等待
    if (loading || !amap) {
      return;
    }

    // 如果学校信息还未加载，等待
    const schoolId = getTargetSchoolId();
    if (!schoolId || !activeSchool) {
      return;
    }

    // 如果地图容器还未挂载，等待
    if (!mapRef.current) {
      return;
    }

    // 如果地图实例已存在，不重复初始化
    if (mapInstanceRef.current) {
      return;
    }

    const initMap = async () => {
      try {

        // 第一阶段：优先初始化地图实例（不等待插件）
        const map = new amap.Map(mapRef.current, {
          zoom: 15,
          center: [activeSchool.centerLng, activeSchool.centerLat],
          viewMode: "3D",
          mapStyle: "amap://styles/normal",
        });

        mapInstanceRef.current = map;
        setIsMapReady(true);

        // 第二阶段：地图创建后，延迟加载插件（不阻塞地图渲染）
        // 使用 setTimeout 确保地图先渲染，再加载插件
        setTimeout(() => {
          loadPluginsSequentially(map).catch((error) => {
            console.error("插件加载异常:", error);
            // 插件加载失败不影响地图使用
          });
        }, 500); // 延迟 500ms 确保地图先渲染
      } catch (error) {
        console.error("地图初始化失败:", error);
        toast.error("地图加载失败，请刷新页面重试");
      }
    };

    initMap();

    // 清理函数
    return () => {
      if (mouseToolRef.current) {
        try {
          mouseToolRef.current.close();
        } catch (e) {
          // 忽略清理错误
        }
        mouseToolRef.current = null;
      }
      if (polygonEditorRef.current) {
        try {
          polygonEditorRef.current.close();
        } catch (e) {
          // 忽略清理错误
        }
        polygonEditorRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {
          // 忽略清理错误
        }
        mapInstanceRef.current = null;
      }
      setIsMapReady(false);
      setIsPluginsLoaded(false);
    };
  }, [amap, loading, activeSchool, getTargetSchoolId, loadPluginsSequentially, error]);

  // 在地图上渲染校区
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || campuses.length === 0) {
      return;
    }

    // 关键修复：编辑期间禁止重新渲染，防止实例漂移
    if (isEditingRef.current) {
      return;
    }

    // 清除旧的多边形和标签（但保留正在编辑的多边形）
    campusPolygonsRef.current.forEach((polygon, campusId) => {
      // 如果正在编辑该校区，跳过清除
      if (campusId === editingCampusId && editingPolygonRef.current === polygon) {
        return;
      }
      mapInstanceRef.current.remove(polygon);
    });
    
    // 只清除非编辑状态的多边形
    if (!isEditingRef.current) {
      campusPolygonsRef.current.clear();
    } else {
      // 编辑期间，只清除非编辑的多边形
      const toRemove: string[] = [];
      campusPolygonsRef.current.forEach((polygon, campusId) => {
        if (campusId !== editingCampusId || editingPolygonRef.current !== polygon) {
          toRemove.push(campusId);
        }
      });
      toRemove.forEach((id) => campusPolygonsRef.current.delete(id));
    }

    campusLabelsRef.current.forEach((label) => {
      mapInstanceRef.current.remove(label);
    });
    campusLabelsRef.current.clear();

    // 渲染每个校区
    campuses.forEach((campus) => {
      // 解析边界数据
      let boundary = campus.boundary;
      if (typeof boundary === "string") {
        try {
          boundary = JSON.parse(boundary);
        } catch (error) {
          console.error("解析校区边界失败:", error);
          return;
        }
      }

      if (!boundary || boundary.type !== "Polygon") {
        return;
      }

      const coordinates = boundary.coordinates[0];
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return;
      }

      // 创建多边形（Reddit 橙色风格）
      // 如果正在编辑该校区，使用更明显的样式
      const isEditing = editingCampusId === campus.id;
      
      // 关键修复：如果正在编辑该校区且已有锁定实例，复用该实例，不创建新的
      if (isEditing && editingPolygonRef.current && editingPolygonRef.current === campusPolygonsRef.current.get(campus.id)) {
        return; // 跳过创建，使用已锁定的实例
      }
      
      const polygon = new amap.Polygon({
        path: coordinates,
        fillColor: isEditing ? "#FF6600" : "#FF4500",
        fillOpacity: isEditing ? 0.25 : 0.15,
        strokeColor: isEditing ? "#FF6600" : "#FF4500",
        strokeWeight: isEditing ? 4 : 2, // 编辑模式下加粗边缘
        strokeOpacity: isEditing ? 1.0 : 0.6,
        strokeDasharray: isEditing ? undefined : [10, 5], // 编辑模式下使用实线
        zIndex: isEditing ? 100 : 10, // 编辑模式下使用高 zIndex，防止渲染层级干扰
        bubble: true, // 允许事件冒泡
        draggable: false, // 防止与编辑器冲突
      });

      polygon.setMap(mapInstanceRef.current);
      campusPolygonsRef.current.set(campus.id, polygon);

      // 创建校区标签（使用 Text 标记）
      const [centerLng, centerLat] = campus.center;
      const text = new amap.Text({
        text: campus.name,
        position: [centerLng, centerLat],
        style: {
          fontSize: "14px",
          fontWeight: "bold",
          color: "#FF4500",
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          padding: "4px 8px",
          borderRadius: "4px",
          border: "1px solid #FF4500",
        },
        zIndex: 20,
      });

      text.setMap(mapInstanceRef.current);
      campusLabelsRef.current.set(campus.id, text);

      // 点击多边形进入编辑模式
      polygon.on("click", () => {
        if (!isDrawing && !editingCampusId) {
          handleEditCampus(campus.id);
        }
      });
    });

    // 根据缩放级别控制标签显示（缩放级别 >= 16 时显示）
    const updateLabelVisibility = () => {
      if (!mapInstanceRef.current) return;
      
      const zoom = mapInstanceRef.current.getZoom();
      const shouldShow = zoom >= 16;
      
      campusLabelsRef.current.forEach((label) => {
        // 高德地图 Text 使用 show() 和 hide() 方法，而不是 setVisible()
        if (label && typeof label.show === 'function' && typeof label.hide === 'function') {
          if (shouldShow) {
            label.show();
          } else {
            label.hide();
          }
        } else {
          // 如果 show/hide 方法不存在，使用 setMap 方法控制可见性
          if (label && typeof label.setMap === 'function') {
            label.setMap(shouldShow ? mapInstanceRef.current : null);
          }
        }
      });
    };

    mapInstanceRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // 清理函数
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off("zoomend", updateLabelVisibility);
      }
    };
  }, [amap, campuses, isDrawing, editingCampusId]);

  // 开始绘制新校区
  const handleStartDrawing = useCallback(() => {
    if (!amap || !mapInstanceRef.current || !mouseToolRef.current) {
      toast.error("地图未加载完成");
      return;
    }

    if (isDrawing) {
      return;
    }

    setIsDrawing(true);
    setEditingCampusId(null);

    // 关闭编辑模式
    if (polygonEditorRef.current) {
      polygonEditorRef.current.close();
      polygonEditorRef.current = null;
    }

    // 使用 MouseTool 绘制多边形
    mouseToolRef.current.polygon({
      strokeColor: "#FF4500",
      strokeWeight: 3,
      strokeOpacity: 0.8,
      fillColor: "#FF4500",
      fillOpacity: 0.2,
    });

    // 监听绘制完成事件
    mouseToolRef.current.on("draw", (e: any) => {
      const polygon = e.obj;
      const path = polygon.getPath();
      
      // 转换为坐标数组（移除最后一个闭合点）
      const coordinates: [number, number][] = path.map((point: any) => [
        point.getLng(),
        point.getLat(),
      ]);

      // 移除地图上的临时多边形
      mapInstanceRef.current.remove(polygon);

      // 保存边界并显示名称输入框
      setNewCampusBoundary(coordinates);
      setShowNameInput(true);
      setIsDrawing(false);
      mouseToolRef.current.close();
    });
  }, [amap, isDrawing]);

  // 编辑校区
  const handleEditCampus = useCallback(async (campusId: string) => {
    if (!amap || !mapInstanceRef.current) {
      toast.error("地图未加载完成");
      return;
    }

    if (isDrawing) {
      toast.error("请先完成或取消当前绘制");
      return;
    }

    const polygon = campusPolygonsRef.current.get(campusId);
    if (!polygon) {
      toast.error("校区多边形不存在");
      return;
    }

    // 确保多边形已添加到地图
    if (!polygon.getMap()) {
      polygon.setMap(mapInstanceRef.current);
    }

    // 关键修复：进入编辑模式前，锁定编辑状态，防止 React 干扰
    isEditingRef.current = true;
    editingPolygonRef.current = polygon;
    setEditingCampusId(campusId);
    setIsDrawing(false);

    // 关闭绘制工具
    if (mouseToolRef.current) {
      mouseToolRef.current.close();
    }

    // 关闭之前的编辑器（如果存在）
    if (polygonEditorRef.current) {
      try {
        polygonEditorRef.current.close();
      } catch (e) {
        // 忽略关闭错误
      }
      polygonEditorRef.current = null;
    }
    
    // 关键修复：清理其他不需要的多边形，确保视口中只有一个活动的 Polygon 实例
    campusPolygonsRef.current.forEach((otherPolygon, otherCampusId) => {
      if (otherCampusId !== campusId && otherPolygon !== polygon) {
        try {
          mapInstanceRef.current.remove(otherPolygon);
        } catch (e) {
          // 忽略移除错误
        }
      }
    });

    try {
      // 显示加载状态
      toast.loading("正在加载编辑器...", { id: "editor-loading" });

      // 加载 PolygonEditor 插件
      await loadAMapPlugin("AMap.PolygonEditor");

      // 关键修复：延迟实例化，确保浏览器主线程完成插件挂载
      // 使用 requestAnimationFrame 确保在下一帧执行
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            resolve();
          }, 50); // 额外延迟 50ms，确保插件完全挂载
        });
      });

      // 最终确认：显式检查插件是否存在
      // 针对 PolygonEditor 的直接检查
      if (!window.AMap || !window.AMap.PolygonEditor || typeof window.AMap.PolygonEditor !== 'function') {
        // 兼容性检查：尝试 PolyEditor
        if (window.AMap && (window.AMap as any).PolyEditor && typeof (window.AMap as any).PolyEditor === 'function') {
          // 使用 PolyEditor 作为备选
          console.warn("使用 PolyEditor 作为 PolygonEditor 的备选");
        } else {
          toast.dismiss("editor-loading");
          toast.error("多边形编辑器插件尚未挂载，请刷新页面重试");
          setEditingCampusId(null);
          return;
        }
      }

      // 确保 amap 对象也有 PolygonEditor
      if (!amap.PolygonEditor && !(amap as any).PolyEditor) {
        toast.dismiss("editor-loading");
        toast.error("多边形编辑器插件加载失败，请刷新页面重试");
        setEditingCampusId(null);
        return;
      }

      // 创建编辑器实例（使用备选方案如果主方案不可用）
      const EditorClass = amap.PolygonEditor || (amap as any).PolyEditor;
      if (!EditorClass) {
        toast.dismiss("editor-loading");
        toast.error("无法找到编辑器构造函数，请刷新页面重试");
        setEditingCampusId(null);
        return;
      }

      // 创建编辑器实例（使用备选方案如果主方案不可用）
      // 确保多边形 zIndex 足够高，防止渲染层级干扰
      const currentZIndex = polygon.getOptions()?.zIndex || 15;
      if (currentZIndex < 100) {
        polygon.setOptions({ zIndex: 100 });
      }
      
      const editorOptions: any = {};
      polygonEditorRef.current = new EditorClass(mapInstanceRef.current, polygon, editorOptions);
      
      // 开启编辑模式（显示可拖拽的控制点）
      polygonEditorRef.current.open();
      
      toast.dismiss("editor-loading");

      // 监听编辑事件 - 关键修复：使用 hide/show 组合技强制 Canvas 物理刷新
      // 这是高德 2.0 社区最有效的暴力刷新手段
      let rafId: number | null = null;
      let lastPathHash: string = "";
      
      polygonEditorRef.current.on("adjust", (e: any) => {
        // 取消之前的动画帧请求
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        
        // 使用 requestAnimationFrame 确保与显示器刷新率同步
        rafId = requestAnimationFrame(() => {
          // 关键修复：通过深度克隆路径生成新引用，强制触发渲染更新
          if (mapInstanceRef.current && polygon) {
            try {
              // 获取当前路径（LngLat 对象数组）
              const rawPath = polygon.getPath();
              
              if (!rawPath || rawPath.length < 3) {
                return;
              }
              
              // 将 LngLat 对象数组转换为纯坐标数组，生成全新的引用
              const newPath: [number, number][] = rawPath.map((p: any) => {
                let lng: number;
                let lat: number;
                
                if (p && typeof p.getLng === 'function' && typeof p.getLat === 'function') {
                  lng = p.getLng();
                  lat = p.getLat();
                } else if (Array.isArray(p) && p.length === 2) {
                  lng = p[0];
                  lat = p[1];
                } else if (p && typeof p.lng === 'number' && typeof p.lat === 'number') {
                  lng = p.lng;
                  lat = p.lat;
                } else {
                  return null;
                }
                
                return [lng, lat] as [number, number];
              }).filter((point): point is [number, number] => point !== null);
              
              if (newPath.length < 3) {
                return;
              }
              
              // 计算路径哈希，检查是否真的变化了
              const pathHash = JSON.stringify(newPath);
              
              // 关键修复：使用 hide/show 组合技强制 Canvas 物理刷新
              // 这是高德 2.0 社区最有效的暴力刷新手段
              // 先更新路径数据
              polygon.setPath(newPath);
              
              // 强制刷新：hide() 瞬间隐藏，show() 瞬间显示 -> 触发物理重绘
              // 这会强制渲染引擎销毁该物体的当前缓存并重新构建 Canvas 路径
              try {
                polygon.hide();
                
                // 使用 requestAnimationFrame 确保 hide 操作完成后再 show
                requestAnimationFrame(() => {
                  polygon.show();
                  
                  // 额外保险：调用 map.render() 确保底图重新绘制
                  if (typeof mapInstanceRef.current.render === 'function') {
                    mapInstanceRef.current.render();
                  } else {
                    // 如果 render() 不存在，尝试通过微小缩放操作强制重绘
                    const currentZoom = mapInstanceRef.current.getZoom();
                    mapInstanceRef.current.setZoom(currentZoom);
                  }
                });
                
                lastPathHash = pathHash;
              } catch (hideShowErr) {
                // 如果 hide/show 失败，回退到原来的方法
                console.warn("hide/show 刷新失败，回退到 render():", hideShowErr);
                
                if (typeof mapInstanceRef.current.render === 'function') {
                  mapInstanceRef.current.render();
                }
              }
            } catch (err) {
              console.warn("强制重绘失败:", err);
            }
          }
        });
      });

      // 监听编辑结束事件
      polygonEditorRef.current.on("end", () => {
        // 编辑完成时也执行一次路径重置，确保最终状态正确
        if (mapInstanceRef.current && polygon) {
          requestAnimationFrame(() => {
            try {
              const rawPath = polygon.getPath();
              if (rawPath && rawPath.length >= 3) {
                // 转换为纯数组并重置，确保最终状态同步
                const newPath: [number, number][] = rawPath.map((p: any) => {
                  if (p && typeof p.getLng === 'function' && typeof p.getLat === 'function') {
                    return [p.getLng(), p.getLat()] as [number, number];
                  } else if (Array.isArray(p) && p.length === 2) {
                    return [p[0], p[1]] as [number, number];
                  } else if (p && typeof p.lng === 'number' && typeof p.lat === 'number') {
                    return [p.lng, p.lat] as [number, number];
                  }
                  return null;
                }).filter((point): point is [number, number] => point !== null);
                
                if (newPath.length >= 3) {
                  polygon.setPath(newPath);
                  if (typeof mapInstanceRef.current.render === 'function') {
                    mapInstanceRef.current.render();
                  }
                }
              }
            } catch (err) {
              console.warn("最终状态同步失败:", err);
            }
          });
        }
      });

      toast.success("已进入编辑模式，拖动控制点调整校区形状");
    } catch (error) {
      console.error("初始化编辑器失败:", error);
      toast.error("初始化编辑器失败，请刷新页面重试");
      setEditingCampusId(null);
      polygonEditorRef.current = null;
    }
  }, [amap, isDrawing]);

  // 保存编辑后的校区
  const handleSaveEdit = useCallback(async () => {
    if (!editingCampusId || !polygonEditorRef.current) {
      toast.error("没有正在编辑的校区");
      return;
    }

    const polygon = campusPolygonsRef.current.get(editingCampusId);
    if (!polygon) {
      toast.error("校区多边形不存在");
      return;
    }

    try {
      // 关键修复：先关闭编辑器，确保所有更改已提交到多边形对象
      // 关闭编辑器会触发 end 事件，确保多边形路径已更新
      polygonEditorRef.current.close();
      
      // 等待编辑器状态完全同步（使用 requestAnimationFrame 确保在下一帧执行）
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
      
      // 再次确认：执行一次路径重置，确保获取的是最新状态
      try {
        const rawPath = polygon.getPath();
        if (rawPath && rawPath.length >= 3) {
          const newPath: [number, number][] = rawPath.map((p: any) => {
            if (p && typeof p.getLng === 'function' && typeof p.getLat === 'function') {
              return [p.getLng(), p.getLat()] as [number, number];
            } else if (Array.isArray(p) && p.length === 2) {
              return [p[0], p[1]] as [number, number];
            } else if (p && typeof p.lng === 'number' && typeof p.lat === 'number') {
              return [p.lng, p.lat] as [number, number];
            }
            return null;
          }).filter((point): point is [number, number] => point !== null);
          
          if (newPath.length >= 3) {
            polygon.setPath(newPath);
          }
        }
      } catch (err) {
        console.warn("保存前路径确认失败:", err);
      }

      // 强制获取最新路径（确保获取的是调整后的最新坐标）
      // 方法1：直接从多边形获取路径
      let path = polygon.getPath();
      
      // 如果路径为空或无效，尝试从编辑器的目标对象获取
      if (!path || path.length < 3) {
        // 尝试从编辑器的内部状态获取（如果支持）
        try {
          const editorTarget = (polygonEditorRef.current as any).target;
          if (editorTarget && typeof editorTarget.getPath === 'function') {
            path = editorTarget.getPath();
          }
        } catch (err) {
          console.warn("无法从编辑器获取路径:", err);
        }
      }
      
      if (!path || path.length < 3) {
        toast.error("校区边界至少需要3个点");
        // 重新打开编辑器，让用户可以继续编辑
        if (polygon && amap && mapInstanceRef.current) {
          try {
            const EditorClass = amap.PolygonEditor || (amap as any).PolyEditor;
            if (EditorClass) {
              polygonEditorRef.current = new EditorClass(mapInstanceRef.current, polygon);
              polygonEditorRef.current.open();
            }
          } catch (e) {
            console.error("重新打开编辑器失败:", e);
          }
        }
        return;
      }

      // 转换为坐标数组 [lng, lat]
      // 确保正确解析各种格式的坐标点
      const coordinates: [number, number][] = path.map((point: any) => {
        // 兼容不同的点对象格式
        if (point && typeof point.getLng === 'function' && typeof point.getLat === 'function') {
          return [point.getLng(), point.getLat()];
        } else if (Array.isArray(point) && point.length === 2) {
          return [point[0], point[1]];
        } else if (point && typeof point.lng === 'number' && typeof point.lat === 'number') {
          return [point.lng, point.lat];
        } else if (point && point.lnglat) {
          // 某些情况下，点对象可能包装在 lnglat 属性中
          const lnglat = point.lnglat;
          if (typeof lnglat.getLng === 'function' && typeof lnglat.getLat === 'function') {
            return [lnglat.getLng(), lnglat.getLat()];
          } else if (typeof lnglat.lng === 'number' && typeof lnglat.lat === 'number') {
            return [lnglat.lng, lnglat.lat];
          }
        }
        throw new Error(`无法解析坐标点: ${JSON.stringify(point)}`);
      });

      setIsSaving(true);

      // 发送更新请求
      const response = await fetch(`/api/admin/campuses/${editingCampusId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary: coordinates }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("校区更新成功");
        
        // 关键修复：解除编辑锁定，允许 React 重新渲染
        isEditingRef.current = false;
        editingPolygonRef.current = null;
        
        // 清理编辑器
        polygonEditorRef.current = null;
        setEditingCampusId(null);
        
        // 刷新校区列表（这会重新渲染多边形和标签）
        await fetchCampuses();
      } else {
        toast.error(data.message || "更新校区失败");
        // 重新打开编辑器，让用户可以继续编辑
        if (polygon && amap && mapInstanceRef.current) {
          try {
            polygonEditorRef.current = new amap.PolygonEditor(mapInstanceRef.current, polygon);
            polygonEditorRef.current.open();
          } catch (e) {
            console.error("重新打开编辑器失败:", e);
          }
        }
      }
    } catch (error) {
      console.error("更新校区失败:", error);
      toast.error(error instanceof Error ? error.message : "更新校区失败");
      
      // 重新打开编辑器，让用户可以继续编辑
      if (polygon && amap && mapInstanceRef.current) {
        try {
          polygonEditorRef.current = new amap.PolygonEditor(mapInstanceRef.current, polygon);
          polygonEditorRef.current.open();
        } catch (e) {
          console.error("重新打开编辑器失败:", e);
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [editingCampusId, fetchCampuses, amap]);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    if (polygonEditorRef.current) {
      try {
        polygonEditorRef.current.close();
      } catch (e) {
        // 忽略关闭错误
        console.warn("关闭编辑器时出错:", e);
      }
      polygonEditorRef.current = null;
    }
    
    // 关键修复：解除编辑锁定，允许 React 重新渲染
    isEditingRef.current = false;
    editingPolygonRef.current = null;
    setEditingCampusId(null);
    
    toast.info("已取消编辑");
    
    // 刷新校区列表，恢复所有多边形的显示
    fetchCampuses();
  }, [fetchCampuses]);

  // 保存新校区
  const handleSaveNewCampus = useCallback(async () => {
    if (!newCampusName.trim() || !newCampusBoundary) {
      toast.error("请填写校区名称");
      return;
    }

    const schoolId = getTargetSchoolId();
    if (!schoolId) {
      toast.error("未选择学校");
      return;
    }

    setIsSaving(true);
    try {
      const url = currentUser?.role === "SUPER_ADMIN"
        ? `/api/admin/campuses`
        : "/api/admin/campuses";
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: currentUser?.role === "SUPER_ADMIN" ? schoolId : undefined,
          name: newCampusName.trim(),
          boundary: newCampusBoundary,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("校区创建成功");
        setShowNameInput(false);
        setNewCampusName("");
        setNewCampusBoundary(null);
        await fetchCampuses();
      } else {
        toast.error(data.message || "创建校区失败");
      }
    } catch (error) {
      console.error("创建校区失败:", error);
      toast.error("创建校区失败");
    } finally {
      setIsSaving(false);
    }
  }, [newCampusName, newCampusBoundary, getTargetSchoolId, currentUser?.role]);

  // 取消创建新校区
  const handleCancelNewCampus = useCallback(() => {
    setShowNameInput(false);
    setNewCampusName("");
    setNewCampusBoundary(null);
  }, []);

  // 删除校区
  const handleDeleteCampus = useCallback(async (campusId: string) => {
    if (!confirm("确定要删除该校区吗？此操作不可恢复。")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/campuses/${campusId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("校区删除成功");
        await fetchCampuses();
      } else {
        toast.error(data.message || "删除校区失败");
      }
    } catch (error) {
      console.error("删除校区失败:", error);
      toast.error("删除校区失败");
    }
  }, [fetchCampuses]);

  // 定位到校区
  const handleLocateCampus = useCallback((campus: CampusArea) => {
    if (!mapInstanceRef.current) {
      return;
    }

    const polygon = campusPolygonsRef.current.get(campus.id);
    if (polygon) {
      mapInstanceRef.current.setFitView([polygon], false, [60, 60, 60, 60], 17);
    } else {
      const [lng, lat] = campus.center;
      mapInstanceRef.current.setZoomAndCenter(17, [lng, lat]);
    }
  }, []);

  // 检查权限
  const isAuthorized = currentUser?.role === "ADMIN" || 
                       currentUser?.role === "STAFF" || 
                       currentUser?.role === "SUPER_ADMIN";

  if (!isAuthorized) {
    return (
      <AuthGuard requiredRole="ADMIN">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-600">无权访问此页面</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="flex h-screen">
          {/* 左侧控制面板 */}
          <div className="w-80 border-r bg-white p-4 overflow-y-auto">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">校区管理</h2>
              <p className="text-sm text-gray-500 mt-1">
                {activeSchool?.name || "未选择学校"}
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="mb-4 space-y-2">
              <button
                onClick={handleStartDrawing}
                disabled={
                  !isPluginsLoaded || 
                  isDrawing || 
                  editingCampusId !== null || 
                  loading || 
                  !isMapReady || 
                  !activeSchool ||
                  !getTargetSchoolId()
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#FF4500] text-white rounded-lg hover:bg-[#FF5500] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
                {!activeSchool || !getTargetSchoolId()
                  ? "请先选择学校"
                  : loading
                  ? "地图加载中..."
                  : !isMapReady
                  ? "地图初始化中..."
                  : isPluginsLoading
                  ? "编辑器准备中..."
                  : !isPluginsLoaded
                  ? "编辑器加载中..."
                  : "新增校区"}
              </button>

              {editingCampusId && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="h-4 w-4" />
                    取消
                  </button>
                </div>
              )}
            </div>

            {/* 校区列表 */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">校区列表</h3>
              {isLoadingCampuses ? (
                <div className="text-sm text-gray-500">加载中...</div>
              ) : campuses.length === 0 ? (
                <div className="text-sm text-gray-500">暂无校区</div>
              ) : (
                campuses.map((campus) => (
                  <Card key={campus.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{campus.name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          创建于 {new Date(campus.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleLocateCampus(campus)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="定位"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {editingCampusId !== campus.id && (
                          <>
                            <button
                              onClick={() => handleEditCampus(campus.id)}
                              disabled={!isPluginsLoaded || !isMapReady || loading}
                              className="p-1 text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              title={
                                loading || !isMapReady
                                  ? "地图加载中..."
                                  : isPluginsLoading
                                  ? "编辑器准备中..."
                                  : !isPluginsLoaded
                                  ? "编辑器加载中..."
                                  : "编辑"
                              }
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCampus(campus.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* 右侧地图区域 */}
          <div className="flex-1 relative min-h-0">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                <div className="text-center">
                  <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent mx-auto"></div>
                  <p className="text-sm text-gray-600">地图加载中...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
                <div className="text-center">
                  <p className="text-sm text-red-600">地图加载失败: {error.message}</p>
                </div>
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: '400px' }} />
            
            {/* 名称输入对话框 */}
            {showNameInput && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30 bg-white rounded-lg shadow-lg p-4 border border-gray-200 min-w-[300px]">
                <h3 className="font-semibold text-gray-900 mb-3">输入校区名称</h3>
                <input
                  type="text"
                  value={newCampusName}
                  onChange={(e) => setNewCampusName(e.target.value)}
                  placeholder="例如：南湖校区"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF4500] mb-3"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNewCampus}
                    disabled={isSaving || !newCampusName.trim()}
                    className="flex-1 px-4 py-2 bg-[#FF4500] text-white rounded-lg hover:bg-[#FF5500] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancelNewCampus}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 绘制提示 */}
            {isDrawing && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30 bg-white rounded-lg shadow-lg p-4 border border-[#FF4500]">
                <p className="text-sm text-gray-700">
                  请在地图上绘制校区边界，双击完成绘制
                </p>
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
