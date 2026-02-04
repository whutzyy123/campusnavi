import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { centroid } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

/**
 * POST /api/admin/school
 * 创建新学校
 * 
 * 请求体：
 * {
 *   name: string,
 *   schoolCode: string,
 *   boundary: [number, number][] // [[lng, lat], ...]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, schoolCode, boundary } = body;

    // 验证必填字段
    if (!name || !schoolCode || !boundary) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：name, schoolCode, boundary" },
        { status: 400 }
      );
    }

    // 验证学校代码格式（仅小写字母和数字）
    if (!/^[a-z0-9]+$/.test(schoolCode)) {
      return NextResponse.json(
        { success: false, message: "学校代码只能包含小写字母和数字" },
        { status: 400 }
      );
    }

    // 验证边界点数量（至少3个点才能构成多边形）
    if (!Array.isArray(boundary) || boundary.length < 3) {
      return NextResponse.json(
        { success: false, message: "边界至少需要3个点" },
        { status: 400 }
      );
    }

    // 验证坐标格式
    for (const point of boundary) {
      if (!Array.isArray(point) || point.length !== 2) {
        return NextResponse.json(
          { success: false, message: "边界坐标格式错误，应为 [lng, lat] 数组" },
          { status: 400 }
        );
      }
      const [lng, lat] = point;
      if (typeof lng !== "number" || typeof lat !== "number" || isNaN(lng) || isNaN(lat)) {
        return NextResponse.json(
          { success: false, message: "坐标必须是有效的数字" },
          { status: 400 }
        );
      }
    }

    // 检查学校代码是否已存在
    const existingSchool = await prisma.school.findUnique({
      where: { schoolCode },
    });

    if (existingSchool) {
      return NextResponse.json(
        { success: false, message: `学校代码 "${schoolCode}" 已存在` },
        { status: 409 }
      );
    }

    // 构建 GeoJSON 格式的多边形（闭合：首尾相连）
    const closedBoundary = [...boundary, boundary[0]];
    const polygon: Polygon = {
      type: "Polygon",
      coordinates: [closedBoundary],
    };

    // 使用 Turf.js 计算多边形中心点
    const polygonFeature: Feature<Polygon> = {
      type: "Feature",
      geometry: polygon,
      properties: {},
    };

    const center = centroid(polygonFeature);
    const [centerLng, centerLat] = center.geometry.coordinates;

    // 保存到数据库
    const school = await prisma.school.create({
      data: {
        name: name.trim(),
        schoolCode: schoolCode.trim().toLowerCase(),
        boundary: polygon as any, // Prisma 的 Json 类型
        centerLat,
        centerLng,
      },
    });

    return NextResponse.json({
      success: true,
      message: "学校初始化成功",
      data: {
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
        centerLat: school.centerLat,
        centerLng: school.centerLng,
      },
    });
  } catch (error) {
    console.error("创建学校失败:", error);
    
    // 处理 Prisma 唯一约束错误
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, message: "学校代码已存在" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: "服务器内部错误", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

