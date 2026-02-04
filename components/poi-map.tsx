/**
 * POI 地图组件
 * 支持显示学校边界和 POI 标记
 */

"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import toast from "react-hot-toast";
import { useAMap } from "@/hooks/use-amap";
import { CoordinateConverter } from "@/lib/amap-loader";
import { useNavigationStore } from "@/store/use-navigation-store";
import type { School } from "@/store/use-school-store";
import type { POIWithStatus } from "@/lib/poi-utils";
import { getCategoryIcon, getMarkerColor } from "@/lib/poi-utils";

interface POIMapProps {
  school: School | null;
  pois: POIWithStatus[];
  userLocation?: [number, number]; // [lng, lat]
  onPOIClick?: (poi: POIWithStatus) => void;
  onLocationUpdate?: (location: [number, number]) => void;
  onLocatingChange?: (isLocating: boolean) => void;
  className?: string;
}

export interface POIMapRef {
  locate: () => void;
  isLocating: boolean;
}

export const POIMap = forwardRef<POIMapRef, POIMapProps>(
  ({ school, pois, userLocation, onPOIClick, onLocationUpdate, onLocatingChange, className = "w-full h-screen" }, ref) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const boundaryPolygonRef = useRef<any>(null); // 保留用于向后兼容（如果学校有旧边界）
    const campusPolygonsRef = useRef<Map<string, any>>(new Map()); // 存储校区多边形实例
    const campusLabelsRef = useRef<Map<string, any>>(new Map()); // 存储校区标签实例
    const userMarkerRef = useRef<any>(null);
    const poiMarkersRef = useRef<any[]>([]);
    const walkingRef = useRef<any>(null);
    const routePolylineRef = useRef<any>(null);
    const geolocationRef = useRef<any>(null);
    const hasInitialLocated = useRef(false); // 防止自动定位重复执行
    // 使用 ref 存储回调函数，避免依赖项变化导致 handleLocate 重新创建
    const onLocationUpdateRef = useRef(onLocationUpdate);
    const onLocatingChangeRef = useRef(onLocatingChange);
    
    // 同步更新 ref，确保始终使用最新的回调函数
    useEffect(() => {
      onLocationUpdateRef.current = onLocationUpdate;
      onLocatingChangeRef.current = onLocatingChange;
    }, [onLocationUpdate, onLocatingChange]);

    const [isLocating, setIsLocating] = useState(false);
    const [internalUserLocation, setInternalUserLocation] = useState<[number, number] | null>(null);
    const { amap, loading, error } = useAMap();
    const {
      isNavigating,
      startPoint,
      endPoint,
      stopNavigation,
      updateRouteInfo,
      setRouteSteps,
      selectMode,
    } = useNavigationStore();

    // 定位处理函数
    // force: true 表示强制定位（用户点击按钮），false 表示自动定位（仅首次）
    const handleLocate = useCallback((force: boolean = false) => {
      if (!amap || !mapInstanceRef.current) {
        if (force) {
          toast.error("地图未加载完成，请稍后重试");
        }
        return;
      }

      // 检查定位插件是否已加载
      if (!amap.Geolocation) {
        if (force) {
          toast.error("定位服务不可用，请刷新页面重试");
        }
        return;
      }

      // 自动定位：如果已经执行过，不再重复
      if (!force && hasInitialLocated.current) {
        return;
      }

      setIsLocating(true);
      if (onLocatingChangeRef.current) {
        onLocatingChangeRef.current(true);
      }

      // 如果定位实例不存在，创建新的
      if (!geolocationRef.current) {
        geolocationRef.current = new amap.Geolocation({
          enableHighAccuracy: true, // 高精度定位（GPS/高精度模式）
          timeout: 15000, // 超时 15 秒，给 GPS 更多搜星时间
          noIpLocate: 0, // 优先使用高精度定位，0 表示不禁用 IP 定位作为备选
          needAddress: false, // 减少解析地址的开销，提高响应速度
          convert: true, // 确保偏移量符合高德地图标准（GCJ-02）
          buttonPosition: "RB", // 隐藏高德默认按钮
          zoomToAccuracy: true, // 定位成功后自动调整视野
          showButton: false, // 不显示定位按钮
          showMarker: false, // 不显示定位标记（我们用自己的蓝点）
          showCircle: true, // 显示定位精度圆圈，提示用户精度范围
          panToLocation: true, // 定位成功后自动平移地图
        });

        // 监听定位错误事件
        geolocationRef.current.on("error", (error: any) => {
          console.error("定位错误:", error);
          setIsLocating(false);
          if (onLocatingChangeRef.current) {
            onLocatingChangeRef.current(false);
          }
          
          const errorMsg = error?.message || "定位失败";
          if (errorMsg.includes("Permission Denied") || errorMsg.includes("用户拒绝")) {
            toast.error("定位失败，请检查浏览器权限设置");
          } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
            toast.error("定位超时，请检查网络连接");
          } else if (errorMsg.includes("位置不可用") || errorMsg.includes("Position Unavailable")) {
            toast.error("无法获取位置信息，请检查设备定位功能");
          } else {
            toast.error("定位失败，请稍后重试");
          }
        });
      }

      // 获取当前位置
      geolocationRef.current.getCurrentPosition(
        (status: string, result: any) => {
          setIsLocating(false);
          if (onLocatingChangeRef.current) {
            onLocatingChangeRef.current(false);
          }

          // 标记已执行过自动定位
          if (!force) {
            hasInitialLocated.current = true;
          }

          if (status === "complete") {
            const { lng, lat } = result.position;
            const location: [number, number] = [lng, lat];
            setInternalUserLocation(location);
            if (onLocationUpdateRef.current) {
              onLocationUpdateRef.current(location);
            }
            // 地图会自动平移（panToLocation: true）
          } else {
            // 定位失败
            const errorMsg = result?.message || "定位失败";
            if (errorMsg.includes("Permission Denied") || errorMsg.includes("用户拒绝")) {
              toast.error("定位失败，请检查浏览器权限设置");
            } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
              toast.error("定位超时，请检查网络连接");
            } else if (errorMsg.includes("位置不可用") || errorMsg.includes("Position Unavailable")) {
              toast.error("无法获取位置信息，请检查设备定位功能");
            } else {
              toast.error("定位失败，请稍后重试");
            }
          }
        }
      );
    }, [amap]); // 移除 onLocationUpdate 和 onLocatingChange 依赖，使用 ref 存储


    // 暴露定位函数给父组件（强制定位，无视锁）
    useImperativeHandle(ref, () => ({
      locate: () => handleLocate(true),
      isLocating,
    }), [handleLocate, isLocating]);

    // 使用内部定位或外部传入的定位
    const currentUserLocation = userLocation || internalUserLocation || undefined;

  // 初始化地图（仅创建一次，不随 school 变化重新创建）
  useEffect(() => {
    if (!amap || !mapRef.current || mapInstanceRef.current) {
      return;
    }

    // 确定地图中心点
    const center: [number, number] = school
      ? [school.centerLng, school.centerLat]
      : currentUserLocation || [116.397428, 39.90923]; // 默认：北京

    // 创建地图实例
    // 修复：提高初始缩放级别，避免显示"世界地图"
    // 如果没有学校数据，使用 zoom: 15（而不是 13），这样即使没有学校也不会显示全球视图
    const map = new amap.Map(mapRef.current, {
      zoom: school ? 16 : 15, // 提高初始缩放级别
      center,
      viewMode: "3D",
      mapStyle: "amap://styles/normal",
    });

    mapInstanceRef.current = map;

    // 地图加载完成后自动请求定位（仅首次）
    const handleMapComplete = () => {
      // 检查浏览器定位权限
      if (navigator.geolocation && !hasInitialLocated.current) {
        // 延迟一下，确保地图完全渲染
        setTimeout(() => {
          handleLocate(false); // 自动定位，非强制
        }, 500);
      }
    };
    map.on("complete", handleMapComplete);

    // 根据缩放级别更新容器上的 data-zoom-level 属性，用于控制 POI Marker 大小
    const updateZoomLevelAttr = () => {
      if (!mapRef.current || !mapInstanceRef.current) return;
      const currentZoom = mapInstanceRef.current.getZoom ? mapInstanceRef.current.getZoom() : 15;
      const level = currentZoom < 16 ? "low" : "high";
      mapRef.current.setAttribute("data-zoom-level", level);
    };

    // 初始化时先设置一次
    updateZoomLevelAttr();

    // 监听缩放变化
    map.on("zoomend", updateZoomLevelAttr);
    map.on("zoomchange", updateZoomLevelAttr);

    // 地图点击选点：仅在 selectMode 不为空时生效
    const handleMapClick = (event: any) => {
      // 1. 调试日志：确认点击事件触发
      console.log("Map Clicked:", event?.lnglat);

      // 2. 始终从 Store 读取最新的 selectMode，避免闭包问题
      const currentMode = useNavigationStore.getState().selectMode;
      console.log("Current Select Mode:", currentMode);

      if (!currentMode || !event?.lnglat) return;

      const point = {
        lng: event.lnglat.getLng(),
        lat: event.lnglat.getLat(),
        name: currentMode === "start" ? "地图选点(起点)" : "地图选点(终点)",
      };

      // 3. 根据当前模式更新起点/终点
      if (currentMode === "start") {
        useNavigationStore.getState().setStartPoint(point);
      } else if (currentMode === "end") {
        useNavigationStore.getState().setEndPoint(point);
      }

      // 4. 选完后自动退出选点模式
      useNavigationStore.getState().setSelectMode(null);
    };

    map.on("click", handleMapClick);

    // 清理函数：仅在组件卸载或 amap 变化时清理
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off("zoomend", updateZoomLevelAttr);
        mapInstanceRef.current.off("zoomchange", updateZoomLevelAttr);
        mapInstanceRef.current.off("click", handleMapClick);
        mapInstanceRef.current.off("complete", handleMapComplete);
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [amap]); // 修复：移除 handleLocate 依赖，使用 ref 存储回调函数，确保地图只初始化一次

  // 选点模式下给地图容器增加十字准星光标，增强交互反馈
  useEffect(() => {
    if (!mapRef.current) return;

    if (selectMode) {
      mapRef.current.classList.add("cursor-crosshair");
    } else {
      mapRef.current.classList.remove("cursor-crosshair");
    }
  }, [selectMode]);

  // 校区列表状态
  const [campuses, setCampuses] = useState<Array<{
    id: string;
    name: string;
    boundary: any;
    center: [number, number];
  }>>([]);

  // 加载校区列表（使用公开 API）
  useEffect(() => {
    if (!school?.id) {
      setCampuses([]);
      return;
    }

    const fetchCampuses = async () => {
      try {
        const response = await fetch(`/api/schools/${school.id}/campuses`);
        const data = await response.json();
        if (data.success && data.data) {
          setCampuses(data.data);
        }
      } catch (error) {
        console.error("加载校区列表失败:", error);
      }
    };

    fetchCampuses();
  }, [school?.id]);

  // 绘制多校区边界和标签
  const drawCampuses = useCallback(() => {
    if (!amap || !mapInstanceRef.current || !school) {
      return;
    }

    // 清除旧的校区多边形和标签
    campusPolygonsRef.current.forEach((polygon) => {
      try {
        mapInstanceRef.current.remove(polygon);
      } catch (error) {
        console.warn("移除校区多边形失败:", error);
      }
    });
    campusPolygonsRef.current.clear();

    campusLabelsRef.current.forEach((label) => {
      try {
        mapInstanceRef.current.remove(label);
      } catch (error) {
        console.warn("移除校区标签失败:", error);
      }
    });
    campusLabelsRef.current.clear();

    // 如果有校区数据，优先使用校区数据
    if (campuses.length > 0) {
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

        // 创建校区多边形（Reddit 风格）
        const polygon = new amap.Polygon({
          path: coordinates,
          fillColor: "#4ade80",
          fillOpacity: 0.15,
          strokeColor: "#22c55e",
          strokeWeight: 2,
          strokeOpacity: 0.4,
          strokeDasharray: [10, 5],
          zIndex: 10,
        });

        polygon.setMap(mapInstanceRef.current);
        campusPolygonsRef.current.set(campus.id, polygon);

        // 创建校区标签（在中心点显示名称）
        const [centerLng, centerLat] = campus.center;
        const text = new amap.Text({
          text: campus.name,
          position: [centerLng, centerLat],
          style: {
            fontSize: "14px",
            fontWeight: "bold",
            color: "#22c55e",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid #22c55e",
          },
          zIndex: 20,
        });

        text.setMap(mapInstanceRef.current);
        campusLabelsRef.current.set(campus.id, text);
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

      // 使用所有校区多边形进行 fitView
      const polygons = Array.from(campusPolygonsRef.current.values());
      if (polygons.length > 0) {
        try {
          mapInstanceRef.current.setFitView(polygons, false, [60, 60, 60, 60], 17);
        } catch (error) {
          console.warn("setFitView 失败，使用 panTo:", error);
          mapInstanceRef.current.panTo([school.centerLng, school.centerLat]);
        }
      }
    } else {
      // 如果没有校区数据，使用旧的学校边界（向后兼容）
      let boundary = school.boundary;
      if (typeof boundary === "string") {
        try {
          boundary = JSON.parse(boundary);
        } catch (error) {
          console.error("解析学校边界数据失败:", error);
          return;
        }
      }

      if (boundary && boundary.type === "Polygon") {
        const coordinates = boundary.coordinates[0];
        if (Array.isArray(coordinates) && coordinates.length > 0) {
          boundaryPolygonRef.current = new amap.Polygon({
            path: coordinates,
            fillColor: "#4ade80",
            fillOpacity: 0.15,
            strokeColor: "#22c55e",
            strokeWeight: 2,
            strokeOpacity: 0.4,
            strokeDasharray: [10, 5],
            zIndex: 10,
          });

          boundaryPolygonRef.current.setMap(mapInstanceRef.current);

          try {
            mapInstanceRef.current.setFitView([boundaryPolygonRef.current], false, [60, 60, 60, 60], 17);
          } catch (error) {
            console.warn("setFitView 失败，使用 panTo:", error);
            mapInstanceRef.current.panTo([school.centerLng, school.centerLat]);
          }
        }
      }
    }
  }, [amap, school, campuses]);

  // 绘制校区边界和标签（当地图和学校数据都准备好时）
  useEffect(() => {
    // 确保地图实例已创建
    if (!amap || !mapInstanceRef.current) {
      return;
    }

    // 如果学校数据未准备好，清理旧边界
    if (!school) {
      // 清理校区多边形和标签
      campusPolygonsRef.current.forEach((polygon) => {
        try {
          mapInstanceRef.current.remove(polygon);
        } catch (error) {
          console.warn("清理校区多边形失败:", error);
        }
      });
      campusPolygonsRef.current.clear();

      campusLabelsRef.current.forEach((label) => {
        try {
          mapInstanceRef.current.remove(label);
        } catch (error) {
          console.warn("清理校区标签失败:", error);
        }
      });
      campusLabelsRef.current.clear();

      // 清理旧边界
      if (boundaryPolygonRef.current) {
        try {
          mapInstanceRef.current.remove(boundaryPolygonRef.current);
          boundaryPolygonRef.current = null;
        } catch (error) {
          console.warn("清理边界多边形失败:", error);
        }
      }
      return;
    }

    // 延迟绘制，确保地图完全渲染
    const timer = setTimeout(() => {
      drawCampuses();
    }, 100);

    // 清理函数
    return () => {
      clearTimeout(timer);
    };
  }, [amap, school, drawCampuses]);

  // 监听 school 变化，强制聚焦到学校（新增：修复地图显示世界地图的 Bug）
  useEffect(() => {
    if (!mapInstanceRef.current || !school) {
      return;
    }

    // 验证中心点坐标有效性
    const isValidCenter = school.centerLng && school.centerLat && 
                          !isNaN(school.centerLng) && !isNaN(school.centerLat) &&
                          school.centerLng >= 73 && school.centerLng <= 135 &&
                          school.centerLat >= 3 && school.centerLat <= 54;

    if (!isValidCenter) {
      return;
    }

    // 如果边界多边形已绘制，优先使用 setFitView
    // 修复：强制最小缩放级别为 17，确保地图聚焦到校园范围
    if (boundaryPolygonRef.current) {
      try {
        mapInstanceRef.current.setFitView([boundaryPolygonRef.current], false, [60, 60, 60, 60], 17);
      } catch (error) {
        // 回退到中心点聚焦
        mapInstanceRef.current.setZoomAndCenter(17, [school.centerLng, school.centerLat]);
      }
    } else {
      // 如果没有边界多边形，使用中心点聚焦
      // 修复：强制缩放级别为 17，确保地图聚焦到校园范围
      mapInstanceRef.current.setZoomAndCenter(17, [school.centerLng, school.centerLat]);
    }
  }, [school]);

    // 显示用户位置标记（蓝色脉动圆点）
    useEffect(() => {
      if (!amap || !mapInstanceRef.current || !currentUserLocation) {
        // 如果没有用户位置，移除标记
        if (userMarkerRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.remove(userMarkerRef.current);
          userMarkerRef.current = null;
        }
        return;
      }

    // 移除旧的用户位置标记
    if (userMarkerRef.current) {
      mapInstanceRef.current.remove(userMarkerRef.current);
    }

    // 创建用户位置标记（蓝色脉动圆点）
    const pulseMarkerContent = `
      <div style="
        position: relative;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- 外层脉动圆环 -->
        <div style="
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: #1890ff;
          opacity: 0.3;
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        "></div>
        <!-- 中层脉动圆环 -->
        <div style="
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background-color: #1890ff;
          opacity: 0.5;
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: 0.5s;
        "></div>
        <!-- 核心圆点 -->
        <div style="
          position: relative;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #1890ff;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(24, 144, 255, 0.5);
          z-index: 10;
        "></div>
        <style>
          @keyframes pulse-ring {
            0% {
              transform: scale(0.8);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.2);
              opacity: 0.1;
            }
            100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }
        </style>
      </div>
    `;

      userMarkerRef.current = new amap.Marker({
        position: currentUserLocation,
        content: pulseMarkerContent,
        anchor: "center",
        offset: new amap.Pixel(0, 0),
        zIndex: 1000, // 确保用户位置标记在最上层
      });

      userMarkerRef.current.setMap(mapInstanceRef.current);

      // 如果当前没有学校（游客 / 未绑定场景），首次或位置变化时平移地图到用户位置
      // 对于已绑定学校的用户，地图中心始终由学校决定，这里不再强制 panTo
      if (mapInstanceRef.current && !school) {
        mapInstanceRef.current.panTo(currentUserLocation);
      }

    // 清理函数
    return () => {
      if (userMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(userMarkerRef.current);
        userMarkerRef.current = null;
      }
    };
  }, [amap, currentUserLocation, school]);

  // 显示 POI 标记
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !school) {
      return;
    }

    // 移除所有旧的 POI 标记
    poiMarkersRef.current.forEach((marker) => {
      mapInstanceRef.current.remove(marker);
    });
    poiMarkersRef.current = [];

    // 创建新的 POI 标记
    pois.forEach((poi) => {
      // 只显示属于当前学校的 POI
      if (poi.schoolId !== school.id) return;

      const CategoryIcon = getCategoryIcon(poi.category);
      const statusVal = poi.currentStatus?.val || 2;
      const markerColor = getMarkerColor(statusVal); // 根据状态值获取颜色

      // 创建自定义 HTML 内容的 Marker
      // 使用内联样式避免样式冲突，每个 marker 使用唯一的 ID
      const markerId = `poi-marker-${poi.id}`;
      const markerContent = `
        <div id="${markerId}" class="poi-marker-content" style="width: 32px; height: 32px; border-radius: 50%; background-color: ${markerColor}; border: 3px solid #ffffff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease-out; transform-origin: bottom center;">
          <div class="poi-marker-inner" style="color: #ffffff; font-size: 16px; font-weight: bold;">
            📍
          </div>
        </div>
        <style>
          /* 默认视为高缩放级别，保证回退行为 */
          [data-zoom-level="high"] .poi-marker-content {
            transform: scale(1);
            opacity: 1;
            pointer-events: auto;
          }
          /* 低缩放级别时隐藏 POI，减少遮挡 */
          [data-zoom-level="low"] .poi-marker-content {
            opacity: 0;
            pointer-events: none;
            transform: scale(0.6);
          }
          .poi-marker-content:hover {
            transform: scale(1.1);
          }
        </style>
      `;

      const marker = new amap.Marker({
        position: [poi.lng, poi.lat],
        content: markerContent,
        anchor: "center",
        offset: new amap.Pixel(0, 0),
      });

      // 点击事件
      marker.on("click", (e: any) => {
        const navState = useNavigationStore.getState();
        const mode = navState.selectMode;

        // 导航选点模式下优先将 POI 作为起/终点
        if (mode === "start") {
          navState.setStartPoint({
            lng: poi.lng,
            lat: poi.lat,
            name: poi.name,
          });
          navState.setSelectMode(null);
          // 阻止冒泡，不再打开详情抽屉
          return;
        }

        if (mode === "end") {
          navState.setEndPoint({
            lng: poi.lng,
            lat: poi.lat,
            name: poi.name,
          });
          navState.setSelectMode(null);
          return;
        }

        // 普通模式：打开 POI 详情抽屉
        if (onPOIClick) {
          onPOIClick(poi);
        }
      });

      marker.setMap(mapInstanceRef.current);
      poiMarkersRef.current.push(marker);
    });

    // 清理函数
    return () => {
      poiMarkersRef.current.forEach((marker) => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove(marker);
        }
      });
      poiMarkersRef.current = [];
    };
  }, [amap, school, pois, onPOIClick]);

  // 导航功能：开始导航（基于 startPoint 和 endPoint）
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !isNavigating || !startPoint || !endPoint) {
      return;
    }

    const startNav = async () => {
      try {
        // 先检查起点和终点是否在高德服务范围（中国境内 GCJ-02）
        const startValid = CoordinateConverter.isValidGCJ02(startPoint.lng, startPoint.lat);
        const endValid = CoordinateConverter.isValidGCJ02(endPoint.lng, endPoint.lat);

        if (!startValid || !endValid) {
          console.warn("导航起点或终点不在高德地图服务范围内，无法规划步行路线。", {
            startPoint,
            endPoint,
          });
          toast.error("当前起点或终点不在支持范围内，暂不提供步行导航。");
          stopNavigation();
          return;
        }

        // 检查插件是否已加载（插件已在初始化时预加载）
        if (!amap.Walking) {
          console.error("AMap.Walking 插件未加载");
          toast.error("导航服务加载失败，请稍后重试。");
          stopNavigation();
          return;
        }

        // 清除之前的路径
        if (routePolylineRef.current) {
          mapInstanceRef.current.remove(routePolylineRef.current);
          routePolylineRef.current = null;
        }

        // 创建步行导航实例
        const walking = new amap.Walking({
          map: mapInstanceRef.current,
          hideMarkers: false, // 显示起点和终点标记
        });

        walkingRef.current = walking;

        // 搜索路径
        walking.search(
          [startPoint.lng, startPoint.lat], // 起点
          [endPoint.lng, endPoint.lat], // 终点
          (status: string, result: any) => {
            if (status === "complete") {
              // 路径规划成功
              if (result.routes && result.routes.length > 0) {
                const route = result.routes[0];
                const distance = route.distance; // 距离（米）
                const duration = Math.round(route.time / 60); // 时间（分钟）

                // 提取路径点
                const path: [number, number][] = [];
                const stepsSummary: { instruction: string; distance: number }[] = [];

                route.steps.forEach((step: any) => {
                  if (step.path && Array.isArray(step.path)) {
                    step.path.forEach((point: any) => {
                      if (Array.isArray(point) && point.length >= 2) {
                        path.push([point[0], point[1]]);
                      }
                    });
                  }
                  if (step.instruction) {
                    stepsSummary.push({
                      instruction: step.instruction,
                      distance: step.distance ?? 0,
                    });
                  }
                });

                // 更新导航信息与步骤
                updateRouteInfo({
                  distance,
                  duration,
                  path,
                });
                setRouteSteps(stepsSummary);

                // 创建路径折线
                const polyline = new amap.Polyline({
                  path: path,
                  isOutline: true,
                  outlineColor: "#ffeeff",
                  borderWeight: 3,
                  strokeColor: "#3366FF",
                  strokeOpacity: 1,
                  strokeWeight: 6,
                  strokeStyle: "solid",
                  lineJoin: "round",
                  lineCap: "round",
                  zIndex: 50,
                });

                routePolylineRef.current = polyline;
                polyline.setMap(mapInstanceRef.current);

                // 调整地图视野以包含起点和终点
                mapInstanceRef.current.setFitView([polyline], false, [50, 50, 50, 50]);
              }
            } else if (status === "error") {
              console.error("路径规划失败:", result);

              if (result && result.info === "OUT_OF_SERVICE") {
                toast.error("当前区域暂不支持步行导航服务。");
              } else {
                toast.error("路径规划失败，请稍后重试。");
              }

              stopNavigation();
            }
          }
        );
      } catch (error) {
        console.error("导航功能初始化失败:", error);
        toast.error("导航初始化失败，请稍后重试。");
        stopNavigation();
      }
    };

    startNav();

    // 清理函数
    return () => {
      if (routePolylineRef.current) {
        mapInstanceRef.current?.remove(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      if (walkingRef.current) {
        walkingRef.current = null;
      }
    };
  }, [amap, isNavigating, startPoint, endPoint, updateRouteInfo, setRouteSteps, stopNavigation]);

  // 停止导航时清除路径
  useEffect(() => {
    if (!isNavigating && routePolylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.remove(routePolylineRef.current);
      routePolylineRef.current = null;
    }
  }, [isNavigating]);

    if (loading) {
      return (
        <div className={`${className} flex items-center justify-center bg-gray-100`}>
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
        <div className={`${className} flex items-center justify-center bg-red-50`}>
          <div className="text-center">
            <p className="text-lg font-medium text-red-600">地图加载失败</p>
            <p className="mt-2 text-sm text-red-500">{error.message}</p>
          </div>
        </div>
      );
    }

    return <div ref={mapRef} className={className} />;
  }
);

POIMap.displayName = "POIMap";

