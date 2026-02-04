/**
 * 地图容器组件示例
 * 展示如何使用高德地图加载器
 */

"use client";

import { useEffect, useRef } from "react";
import { useAMap } from "@/hooks/use-amap";

interface MapContainerProps {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  className?: string;
}

export function MapContainer({ 
  center = [114.305392, 30.592849], // 默认：武汉大学
  zoom = 15,
  className = "w-full h-screen"
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const { amap, loading, error } = useAMap();

  useEffect(() => {
    if (!amap || !mapRef.current || mapInstanceRef.current) {
      return;
    }

    // 创建地图实例
    const map = new amap.Map(mapRef.current, {
      zoom,
      center,
      viewMode: "3D", // 3D视图
      mapStyle: "amap://styles/normal", // 地图样式
    });

    mapInstanceRef.current = map;

    // 清理函数
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [amap, center, zoom]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100`}>
        <p className="text-gray-600">加载地图中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center bg-red-50`}>
        <p className="text-red-600">地图加载失败: {error.message}</p>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}

