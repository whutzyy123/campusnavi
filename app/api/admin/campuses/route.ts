import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { centroid } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { computeLabelCenter } from "@/lib/campus-label-utils";

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

    // 验证学校是否存在（targetSchoolId 在此处已由上方逻辑保证非空）
    if (!targetSchoolId) {
      return NextResponse.json(
        { success: false, message: "学校ID不能为空" },
        { status: 400 }
      );
    }
    const school = await prisma.school.findUnique({
      where: { id: targetSchoolId },
      select: { id: true, name: true },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 获取该学校的所有校区
    const campuses = await prisma.campusArea.findMany({
      where: { schoolId: targetSchoolId },
      orderBy: { createdAt: "asc" },
    });

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
        error: error instanceof Error ? error.message : "未知错误",
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

    if (auth.role === "STAFF") {
      return NextResponse.json(
        { success: false, message: "工作人员无权修改校区边界数据。" },
        { status: 403 }
      );
    }

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

    // 验证学校是否存在（targetSchoolId 在此处已由上方逻辑保证非空）
    if (!targetSchoolId) {
      return NextResponse.json(
        { success: false, message: "学校ID不能为空" },
        { status: 400 }
      );
    }
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

    // 使用 Turf.js 计算中心点
    const polygonFeature: Feature<Polygon> = {
      type: "Feature",
      geometry: polygon,
      properties: {},
    };

    const center = centroid(polygonFeature);
    const [centerLng, centerLat] = center.geometry.coordinates;
    const centerPoint: [number, number] = [centerLng, centerLat];

    // labelCenter: 使用 polylabel（Pole of Inaccessibility）保证标签落在多边形最“宽敞”位置
    const labelCenterPoint = computeLabelCenter(closedBoundary);

    // 保存到数据库
    const campus = await prisma.campusArea.create({
      data: {
        schoolId: targetSchoolId,
        name: name.trim(),
        boundary: polygon as any,
        center: centerPoint as any,
        labelCenter: labelCenterPoint as any,
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
        labelCenter: campus.labelCenter,
      },
    });
  } catch (error) {
    console.error("创建校区失败:", error);
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
