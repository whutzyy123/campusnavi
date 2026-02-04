import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { booleanPointInPolygon } from "@turf/turf";
import type { Point, Polygon, Feature } from "geojson";

/**
 * GET /api/schools/detect
 * 根据经纬度检测用户所属学校
 * 
 * 查询参数：
 * - lat: 纬度
 * - lng: 经度
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    // 验证参数
    if (!lat || !lng) {
      return NextResponse.json(
        { success: false, message: "缺少必填参数：lat 和 lng" },
        { status: 400 }
      );
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    // 验证坐标有效性
    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { success: false, message: "坐标格式错误" },
        { status: 400 }
      );
    }

    // 验证坐标范围（中国境内大致范围）
    if (longitude < 73 || longitude > 135 || latitude < 3 || latitude > 54) {
      return NextResponse.json(
        { success: false, message: "坐标超出有效范围" },
        { status: 400 }
      );
    }

    // 查询所有学校
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        name: true,
        schoolCode: true,
        boundary: true,
        centerLat: true,
        centerLng: true,
      },
    });

    if (schools.length === 0) {
      return NextResponse.json({
        success: false,
        message: "系统中暂无学校数据",
        school: null,
      });
    }

    // 构建用户位置点（GeoJSON Point）
    const userPoint: Point = {
      type: "Point",
      coordinates: [longitude, latitude], // GeoJSON 格式：[lng, lat]
    };

    const userPointFeature: Feature<Point> = {
      type: "Feature",
      geometry: userPoint,
      properties: {},
    };

    // 遍历所有学校，判断用户位置是否在边界内
    for (const school of schools) {
      try {
        // 确保 boundary 是有效的 GeoJSON Polygon
        const boundary = school.boundary as any;
        
        if (!boundary || boundary.type !== "Polygon") {
          console.warn(`学校 ${school.name} 的边界数据格式无效`);
          continue;
        }

        // 使用 Turf.js 判断点是否在多边形内
        const isInside = booleanPointInPolygon(userPointFeature, boundary as Polygon);

        if (isInside) {
          return NextResponse.json({
            success: true,
            message: "成功识别学校",
            school: {
              id: school.id,
              name: school.name,
              schoolCode: school.schoolCode,
              boundary: school.boundary,
              centerLat: school.centerLat,
              centerLng: school.centerLng,
            },
          });
        }
      } catch (error) {
        console.error(`检测学校 ${school.name} 时出错:`, error);
        continue;
      }
    }

    // 没有找到匹配的学校
    return NextResponse.json({
      success: false,
      message: "未找到匹配的学校，您可能不在任何校区范围内",
      school: null,
    });
  } catch (error) {
    console.error("检测学校失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "服务器内部错误",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

