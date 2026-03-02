/**
 * 学校地图组件
 * 支持显示学校边界、校区标签和自动定位
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useAMap } from "@/hooks/use-amap";
import { ensureLngLat } from "@/lib/campus-label-utils";
import type { School } from "@/store/use-school-store";

interface CampusArea {
  id: string;
  name: string;
  boundary: unknown;
  center: [number, number];
  labelCenter?: [number, number] | unknown;
}

interface SchoolMapProps {
  school: School | null;
  userLocation?: [number, number]; // [lng, lat]
  className?: string;
}

/** 从 [lng, lat] 或 GeoJSON Point 解析坐标，确保 [lng, lat] 顺序 */
function parseLngLat(v: unknown): [number, number] {
  if (!v) return [0, 0];
  if (Array.isArray(v) && v.length >= 2) return ensureLngLat(Number(v[0]), Number(v[1]));
  const obj = v as { coordinates?: unknown[] };
  if (obj?.coordinates && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
    return ensureLngLat(Number(obj.coordinates[0]), Number(obj.coordinates[1]));
  }
  return [0, 0];
}

/** 从 boundary 坐标计算边界框中心（labelCenter 为空时的回退） */
function getBboxCenter(boundary: unknown): [number, number] {
  const b = boundary as { type?: string; coordinates?: number[][][] } | undefined;
  if (!b?.coordinates?.[0]?.length) return [0, 0];
  const ring = b.coordinates[0];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const p of ring) {
    if (Array.isArray(p) && p.length >= 2) {
      minLng = Math.min(minLng, p[0]);
      maxLng = Math.max(maxLng, p[0]);
      minLat = Math.min(minLat, p[1]);
      maxLat = Math.max(maxLat, p[1]);
    }
  }
  if (minLng === Infinity) return [0, 0];
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

export function SchoolMap({ school, userLocation, className = "w-full h-screen" }: SchoolMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const campusPolygonsRef = useRef<Map<string, any>>(new Map());
  const campusLabelsRef = useRef<Map<string, any>>(new Map());
  const [campuses, setCampuses] = useState<CampusArea[]>([]);
  const { amap, loading, error } = useAMap();

  // 初始化地图
  useEffect(() => {
    if (!amap || !mapRef.current || mapInstanceRef.current) {
      return;
    }

    // 确定地图中心点（school center 可选）
    const defaultCenter: [number, number] = [116.397428, 39.90923]; // 北京
    const center: [number, number] = school?.centerLng != null && school?.centerLat != null
      ? [school.centerLng, school.centerLat]
      : userLocation || defaultCenter;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 amap 变化时初始化，加入 school/userLocation 会导致地图重复创建与闪烁
  }, [amap]);

  // 获取校区列表
  useEffect(() => {
    if (!school?.id) {
      setCampuses([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/schools/${school.id}/campuses`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.data)) {
          setCampuses(data.data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- school?.id 足够，避免 school 引用变化触发重复请求
  }, [school?.id]);

  // 绘制学校边界与校区标签（优先使用 labelCenter，无则用边界框中心）
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || campuses.length === 0) {
      return;
    }

    const map = mapInstanceRef.current;
    const polygons = campusPolygonsRef.current;
    const labels = campusLabelsRef.current;

    polygons.forEach((polygon) => {
      try { map.remove(polygon); } catch {}
    });
    polygons.clear();
    labels.forEach((label) => {
      try { map.remove(label); } catch {}
    });
    labels.clear();

    campuses.forEach((campus) => {
      let boundary = campus.boundary;
      if (typeof boundary === "string") {
        try { boundary = JSON.parse(boundary); } catch { return; }
      }
      const b = boundary as { type?: string; coordinates?: number[][][] };
      if (b?.type !== "Polygon" || !b?.coordinates?.[0]?.length) return;

      const coordinates = b.coordinates[0];
      const polygon = new amap.Polygon({
        path: coordinates,
        fillColor: "#FF4500",
        fillOpacity: 0.08,
        strokeColor: "#FF4500",
        strokeWeight: 2,
        strokeOpacity: 0.5,
        strokeDasharray: [10, 5],
        zIndex: 10,
      });
      polygon.setMap(map);
      polygons.set(campus.id, polygon);

      // 优先使用 labelCenter（polylabel），无则用边界框中心
      const labelPos = campus.labelCenter ?? getBboxCenter(boundary);
      const [lng, lat] = parseLngLat(labelPos);
      const text = new amap.Text({
        text: campus.name,
        position: [lng, lat],
        anchor: "center",
        style: {
          fontSize: "14px",
          fontWeight: "bold",
          color: "#FF4500",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          padding: "4px 8px",
          borderRadius: "4px",
          border: "1px solid #FF4500",
        },
        zIndex: 20,
      });
      text.setMap(map);
      labels.set(campus.id, text);
    });

    return () => {
      polygons.forEach((polygon) => {
        try { map?.remove(polygon); } catch {}
      });
      polygons.clear();
      labels.forEach((label) => {
        try { map?.remove(label); } catch {}
      });
      labels.clear();
    };
  }, [amap, campuses]);

  // 若有 center，平移地图到学校中心
  useEffect(() => {
    if (!amap || !mapInstanceRef.current || !school) return;
    if (school.centerLng != null && school.centerLat != null) {
      mapInstanceRef.current.panTo([school.centerLng, school.centerLat]);
    }
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
            <div className="h-2 animate-pulse rounded-full bg-[#FF4500]"></div>
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

