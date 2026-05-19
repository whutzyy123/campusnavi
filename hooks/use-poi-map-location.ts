/**
 * POI 地图定位 Hook
 * 负责用户定位功能（Geolocation 插件）和用户位置标记
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { notify } from "@/lib/ui/notify";
import { getPulseMarkerContent, GEOLOCATION_TIMEOUT, AMAP_Z_INDEX } from "@/lib/poi-map";
import type { School } from "@/store/use-school-store";

export interface UsePOIMapLocationOptions {
  amap: any;
  mapInstanceRef: React.MutableRefObject<any>;
  mapReady: boolean;
  school: School | null;
  userLocation?: [number, number];
  onLocationUpdate?: (location: [number, number]) => void;
  onLocatingChange?: (isLocating: boolean) => void;
  userMarkerRef: React.MutableRefObject<any>;
  geolocationRef: React.MutableRefObject<any>;
}

export interface UsePOIMapLocationResult {
  isLocating: boolean;
  currentUserLocation: [number, number] | undefined;
  locate: () => void;
}

/**
 * POI 地图定位 Hook
 */
export function usePOIMapLocation(options: UsePOIMapLocationOptions): UsePOIMapLocationResult {
  const {
    amap,
    mapInstanceRef,
    mapReady,
    school,
    userLocation,
    onLocationUpdate,
    onLocatingChange,
    userMarkerRef,
    geolocationRef,
  } = options;

  const [isLocating, setIsLocating] = useState(false);
  const [internalUserLocation, setInternalUserLocation] = useState<[number, number] | null>(null);
  const hasInitialLocated = useRef(false);
  const locateToastIdRef = useRef<string | undefined>(undefined);

  // 使用 ref 存储回调函数，避免依赖项变化
  const onLocationUpdateRef = useRef(onLocationUpdate);
  const onLocatingChangeRef = useRef(onLocatingChange);
  useEffect(() => {
    onLocationUpdateRef.current = onLocationUpdate;
    onLocatingChangeRef.current = onLocatingChange;
  }, [onLocationUpdate, onLocatingChange]);

  // 定位处理函数
  // force: true 表示强制定位（用户点击按钮），false 表示自动定位（仅首次）
  const handleLocate = useCallback((force: boolean = false) => {
    if (!amap || !mapInstanceRef.current) {
      if (force) {
        notify.error("地图未加载完成，请稍后重试");
      }
      return;
    }

    // 检查定位插件是否已加载
    if (!amap.Geolocation) {
      if (force) {
        notify.error("定位服务不可用，请刷新页面重试");
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

    const toastId = notify.loading("定位中...");
    locateToastIdRef.current = toastId;

    // 如果定位实例不存在，创建新的
    if (!geolocationRef.current) {
      geolocationRef.current = new amap.Geolocation({
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT,
        noIpLocate: 0,
        needAddress: false,
        convert: true,
        buttonPosition: "RB",
        zoomToAccuracy: false,
        showButton: false,
        showMarker: false,
        showCircle: true,
        panToLocation: false,
      });

      // 监听定位错误事件
      geolocationRef.current.on("error", (error: any) => {
        console.error("定位错误:", error);
        setIsLocating(false);
        if (onLocatingChangeRef.current) {
          onLocatingChangeRef.current(false);
        }
        notify.dismiss(locateToastIdRef.current);
        const errorMsg = error?.message || "定位失败";
        if (errorMsg.includes("Permission Denied") || errorMsg.includes("用户拒绝")) {
          notify.error("定位失败，请检查浏览器权限设置");
        } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
          notify.error("定位超时，请检查网络连接");
        } else if (errorMsg.includes("位置不可用") || errorMsg.includes("Position Unavailable")) {
          notify.error("无法获取位置信息，请检查设备定位功能");
        } else {
          notify.error("定位失败，请稍后重试");
        }
      });
    }

    // 获取当前位置
    geolocationRef.current.getCurrentPosition((status: string, result: any) => {
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
        // 仅当用户点击「定位」按钮时，平移并缩放到用户位置
        if (force && mapInstanceRef.current) {
          mapInstanceRef.current.setZoomAndCenter?.(17, [lng, lat], false, 400);
        }
        notify.success("定位成功", { id: toastId });
      } else {
        notify.dismiss(locateToastIdRef.current);
        const errorMsg = result?.message || "定位失败";
        if (errorMsg.includes("Permission Denied") || errorMsg.includes("用户拒绝")) {
          notify.error("定位失败，请检查浏览器权限设置");
        } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
          notify.error("定位超时，请检查网络连接");
        } else if (errorMsg.includes("位置不可用") || errorMsg.includes("Position Unavailable")) {
          notify.error("无法获取位置信息，请检查设备定位功能");
        } else {
          notify.error("定位失败，请稍后重试");
        }
      }
    });
  }, [amap, mapInstanceRef, geolocationRef]);

  // 使用内部定位或外部传入的定位
  const currentUserLocation = userLocation || internalUserLocation || undefined;

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
    userMarkerRef.current = new amap.Marker({
      position: currentUserLocation,
      content: getPulseMarkerContent(),
      anchor: "center",
      offset: new amap.Pixel(0, 0),
      zIndex: AMAP_Z_INDEX.userLocation,
    });

    userMarkerRef.current.setMap(mapInstanceRef.current);

    // 清理函数
    return () => {
      if (userMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(userMarkerRef.current);
        userMarkerRef.current = null;
      }
    };
  }, [amap, currentUserLocation, school, mapInstanceRef, userMarkerRef]);

  return {
    isLocating,
    currentUserLocation,
    locate: () => handleLocate(true),
  };
}