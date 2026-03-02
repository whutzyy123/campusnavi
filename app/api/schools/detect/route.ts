import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { booleanPointInPolygon } from "@turf/turf";
import type { Point, Polygon, Feature } from "geojson";

export const dynamic = "force-dynamic";

/**
 * GET /api/schools/detect
 * 根据经纬度检测用户所属学校（基于 CampusArea 边界）
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

    // 查询所有学校及其 CampusArea（限制 200 所）
    const schools = await prisma.school.findMany({
      where: { isActive: true },
      take: 200,
      select: {
        id: true,
        name: true,
        schoolCode: true,
        centerLat: true,
        centerLng: true,
        campusAreas: {
          select: { id: true, name: true, boundary: true, center: true },
        },
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

    // 遍历所有学校，检查其 CampusArea 边界
    for (const school of schools) {
      for (const campus of school.campusAreas) {
        try {
          const boundary = campus.boundary as unknown;
          if (!boundary || (boundary as { type?: string }).type !== "Polygon") {
            continue;
          }

          const isInside = booleanPointInPolygon(userPointFeature, boundary as Polygon);
          if (isInside) {
            // 优先使用 CampusArea 的 center，否则用 School 的 center
            const center = campus.center as [number, number] | null;
            const centerLng = center?.[0] ?? school.centerLng;
            const centerLat = center?.[1] ?? school.centerLat;

            return NextResponse.json({
              success: true,
              message: "成功识别学校",
              school: {
                id: school.id,
                name: school.name,
                schoolCode: school.schoolCode,
                centerLat: centerLat ?? undefined,
                centerLng: centerLng ?? undefined,
              },
            });
          }
        } catch (error) {
          console.error(`检测校区 ${campus.name} 时出错:`, error);
          continue;
        }
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
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}

