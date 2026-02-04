/**
 * 学校地图组件
 * 支持显示学校边界和自动定位
 */

"use client";

import { useEffect, useRef } from "react";
import { useAMap } from "@/hooks/use-amap";
import type { School } from "@/store/use-school-store";

interface SchoolMapProps {
  school: School | null;
  userLocation?: [number, number]; // [lng, lat]
  className?: string;
}

export function SchoolMap({ school, userLocation, className = "w-full h-screen" }: SchoolMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const boundaryPolygonRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const { amap, loading, error } = useAMap();

  // 初始化地图
  useEffect(() => {
    if (!amap || !mapRef.current || mapInstanceRef.current) {
      return;
    }

    // 确定地图中心点
    const center: [number, number] = school
      ? [school.centerLng, school.centerLat]
      : userLocation || [116.397428, 39.90923]; // 默认：北京

    // 创建地图实例
    const map = new amap.Map(mapRef.current, {
      zoom: school ? 15 : 13,
      center,
      viewMode: "3D",
      mapStyle: "amap://styles/normal",
    });

    mapInstanceRef.current = map;

    // 清理函数
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [amap]);

  // 绘制学校边界
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !school) {
      return;
    }

    const boundary = school.boundary as any;
    if (!boundary || boundary.type !== "Polygon") {
      return;
    }

    // 移除旧的边界多边形
    if (boundaryPolygonRef.current) {
      mapInstanceRef.current.remove(boundaryPolygonRef.current);
    }

    // 绘制新的边界多边形（浅绿色，半透明）
    const coordinates = boundary.coordinates[0]; // Polygon 的第一层坐标数组
    boundaryPolygonRef.current = new amap.Polygon({
      path: coordinates,
      strokeColor: "#52c41a", // 浅绿色
      strokeWeight: 2,
      strokeOpacity: 0.8,
      fillColor: "#52c41a",
      fillOpacity: 0.15, // 半透明
    });

    boundaryPolygonRef.current.setMap(mapInstanceRef.current);

    // 地图自动平移到学校中心
    mapInstanceRef.current.panTo([school.centerLng, school.centerLat]);

    // 清理函数
    return () => {
      if (boundaryPolygonRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(boundaryPolygonRef.current);
        boundaryPolygonRef.current = null;
      }
    };
  }, [amap, school]);

  // 显示用户位置标记
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !userLocation) {
      return;
    }

    // 移除旧的用户位置标记
    if (userMarkerRef.current) {
      mapInstanceRef.current.remove(userMarkerRef.current);
    }

    // 创建用户位置标记（蓝色圆点）
    userMarkerRef.current = new amap.Marker({
      position: userLocation,
      content: `
        <div style="
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background-color: #1890ff;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        "></div>
      `,
      anchor: "center",
      offset: new amap.Pixel(0, 0),
    });

    userMarkerRef.current.setMap(mapInstanceRef.current);

    // 清理函数
    return () => {
      if (userMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.remove(userMarkerRef.current);
        userMarkerRef.current = null;
      }
    };
  }, [amap, userLocation]);

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

