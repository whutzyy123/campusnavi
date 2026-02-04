/**
 * 用户定位 Hook
 * 负责获取用户当前位置，使用高德地图定位服务
 */

import { useState, useEffect, useCallback } from "react";
import { useAMap } from "@/hooks/use-amap";

interface UseUserLocationReturn {
  userLocation: [number, number] | null; // [lng, lat]
  isLoading: boolean;
  error: string | null;
  refetchLocation: () => void;
}

export function useUserLocation(autoFetch: boolean = true): UseUserLocationReturn {
  const { amap, loading: amapLoading } = useAMap();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = useCallback(() => {
    if (!amap || amapLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // 使用 AMap.plugin 的回调模式确保插件加载完成
    amap.plugin("AMap.Geolocation", () => {
      try {
        // 确保插件已加载
        if (!amap.Geolocation) {
          throw new Error("定位插件加载失败");
        }

        // 创建定位实例
        const geolocation = new amap.Geolocation({
          enableHighAccuracy: true, // 是否使用高精度定位
          timeout: 10000, // 超时时间
          maximumAge: 0, // 缓存时间
          convert: true, // 自动偏移坐标，偏移后的坐标为高德坐标
          showButton: false, // 不显示定位按钮
          buttonDom: "", // 定位按钮的 DOM 容器
          showMarker: false, // 不显示定位标记
          showCircle: false, // 不显示定位精度圆圈
          panToLocation: false, // 定位成功后是否自动调整地图视野
          zoomToAccuracy: false, // 定位成功后是否自动调整地图视野到定位精度范围
        });

        // 获取当前位置
        geolocation.getCurrentPosition((status: string, result: any) => {
          if (status === "complete") {
            const { lng, lat } = result.position;
            setUserLocation([lng, lat]);
            setError(null);
          } else {
            const errorMsg = result?.message || "定位失败，请检查定位权限";
            setError(errorMsg);
            setUserLocation(null);
          }
          setIsLoading(false);
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "定位服务不可用";
        setError(errorMsg);
        setIsLoading(false);
        setUserLocation(null);
      }
    });
  }, [amap, amapLoading]);

  // 自动获取位置
  useEffect(() => {
    if (autoFetch && amap && !amapLoading && !userLocation && !isLoading) {
      fetchLocation();
    }
  }, [amap, amapLoading, autoFetch, userLocation, isLoading, fetchLocation]);

  return {
    userLocation,
    isLoading,
    error,
    refetchLocation: fetchLocation,
  };
}

