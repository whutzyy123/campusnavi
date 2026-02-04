import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { centroid } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

/**
 * GET /api/admin/campuses
 * 获取校区列表
 * 
 * 查询参数：
 * - schoolId: 学校ID（可选，超级管理员必须传递，其他角色使用当前用户的 schoolId）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    const searchParams = request.nextUrl.searchParams;
    const schoolIdParam = searchParams.get("schoolId");

    // 权限逻辑：
    // - 超级管理员：可以传递 schoolId 参数管理任何学校
    // - 校级管理员和工作人员：只能管理自己的学校（使用 auth.schoolId）
    let targetSchoolId: string | null = null;

    if (auth.role === "SUPER_ADMIN") {
      // 超级管理员必须传递 schoolId 参数
      if (!schoolIdParam) {
        return NextResponse.json(
          { success: false, message: "超级管理员必须传递 schoolId 参数" },
          { status: 400 }
        );
      }
      targetSchoolId = schoolIdParam;
    } else {
      // 校级管理员和工作人员只能管理自己的学校
      if (!auth.schoolId) {
        return NextResponse.json(
          { success: false, message: "当前管理员未绑定学校" },
          { status: 400 }
        );
      }
      targetSchoolId = auth.schoolId;

      // 如果传递了 schoolId 参数，验证是否匹配
      if (schoolIdParam && schoolIdParam !== auth.schoolId) {
        return NextResponse.json(
          { success: false, message: "无权访问其他学校的校区数据" },
          { status: 403 }
        );
      }
    }

    // 验证学校是否存在，并获取边界数据（用于自动迁移）
    const school = await prisma.school.findUnique({
      where: { id: targetSchoolId },
      select: {
        id: true,
        name: true,
        boundary: true,
        centerLat: true,
        centerLng: true,
      },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 获取该学校的所有校区
    let campuses = await prisma.campusArea.findMany({
      where: { schoolId: targetSchoolId },
      orderBy: { createdAt: "asc" },
    });

    // 数据平滑迁移：如果 CampusArea 为空，检查 School 表中是否有旧的 boundary 数据
    if (campuses.length === 0 && school.boundary) {
      try {
        // 解析旧的 boundary 数据（可能是 JSON 字符串或对象）
        let boundary: any = school.boundary;
        if (typeof boundary === "string") {
          try {
            boundary = JSON.parse(boundary);
          } catch (parseError) {
            console.error("解析 School.boundary 失败:", parseError);
            boundary = null;
          }
        }

        // 如果 boundary 是有效的 GeoJSON Polygon，则自动迁移
        if (boundary && boundary.type === "Polygon" && Array.isArray(boundary.coordinates) && boundary.coordinates.length > 0) {
          const coordinates = boundary.coordinates[0];
          
          // 计算中心点（如果有 centerLat 和 centerLng，使用它们；否则使用 Turf.js 计算）
          let centerPoint: [number, number];
          if (school.centerLat && school.centerLng) {
            centerPoint = [school.centerLng, school.centerLat];
          } else {
            // 使用 Turf.js 计算中心点
            const polygonFeature: Feature<Polygon> = {
              type: "Feature",
              geometry: boundary,
              properties: {},
            };
            const center = centroid(polygonFeature);
            const [centerLng, centerLat] = center.geometry.coordinates;
            centerPoint = [centerLng, centerLat];
          }

          // 自动创建第一条 CampusArea 记录（名称默认为"主校区"）
          const migratedCampus = await prisma.campusArea.create({
            data: {
              schoolId: targetSchoolId,
              name: "主校区",
              boundary: boundary as any,
              center: centerPoint as any,
            },
          });

          campuses = [migratedCampus];
          
          console.log(`已自动迁移学校 ${targetSchoolId} 的边界数据到 CampusArea`);
        }
      } catch (migrationError) {
        console.error("自动迁移边界数据失败:", migrationError);
        // 迁移失败不影响正常流程，继续返回空数组
      }
    }

    return NextResponse.json({
      success: true,
      data: campuses,
    });
  } catch (error) {
    console.error("获取校区列表失败:", error);
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

/**
 * POST /api/admin/campuses
 * 创建新校区
 * 
 * 请求体：
 * {
 *   schoolId: string, // 学校ID（可选，超级管理员必须传递，其他角色使用当前用户的 schoolId）
 *   name: string, // 校区名称
 *   boundary: [number, number][] // [[lng, lat], ...]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    const body = await request.json();
    const { schoolId: schoolIdParam, name, boundary } = body;

    // 权限逻辑：同 GET
    let targetSchoolId: string | null = null;

    if (auth.role === "SUPER_ADMIN") {
      if (!schoolIdParam) {
        return NextResponse.json(
          { success: false, message: "超级管理员必须传递 schoolId 参数" },
          { status: 400 }
        );
      }
      targetSchoolId = schoolIdParam;
    } else {
      if (!auth.schoolId) {
        return NextResponse.json(
          { success: false, message: "当前管理员未绑定学校" },
          { status: 400 }
        );
      }
      targetSchoolId = auth.schoolId;

      if (schoolIdParam && schoolIdParam !== auth.schoolId) {
        return NextResponse.json(
          { success: false, message: "无权为其他学校创建校区" },
          { status: 403 }
        );
      }
    }

    // 验证必填字段
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: "校区名称不能为空" },
        { status: 400 }
      );
    }

    if (!boundary || !Array.isArray(boundary) || boundary.length < 3) {
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

    // 验证学校是否存在
    const school = await prisma.school.findUnique({
      where: { id: targetSchoolId },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
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
    const centerPoint: [number, number] = [centerLng, centerLat];

    // 保存到数据库
    const campus = await prisma.campusArea.create({
      data: {
        schoolId: targetSchoolId,
        name: name.trim(),
        boundary: polygon as any,
        center: centerPoint as any,
      },
    });

    return NextResponse.json({
      success: true,
      message: "校区创建成功",
      data: {
        id: campus.id,
        name: campus.name,
        schoolId: campus.schoolId,
        center: campus.center,
      },
    });
  } catch (error) {
    console.error("创建校区失败:", error);
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
