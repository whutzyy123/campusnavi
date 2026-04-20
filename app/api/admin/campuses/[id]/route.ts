import { NextRequest, NextResponse } from "next/server";
import { requireSchoolAdminJson, isAuthError } from "@/lib/api/guards";
import { prisma } from "@/lib/prisma";
import { centroid } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { computeLabelCenter } from "@/lib/campus-label-utils";

/**
 * PUT /api/admin/campuses/[id]
 * 更新校区
 * 
 * 请求体：
 * {
 *   name?: string, // 校区名称（可选）
 *   boundary?: [number, number][] // 边界坐标（可选）
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireSchoolAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    if (auth.role === "STAFF") {
      return NextResponse.json(
        { success: false, message: "工作人员无权修改校区边界数据。" },
        { status: 403 }
      );
    }

    const campusId = params.id;
    const body = await request.json();
    const { name, boundary } = body;

    // 获取校区信息
    const campus = await prisma.campusArea.findUnique({
      where: { id: campusId },
      include: { school: true },
    });

    if (!campus) {
      return NextResponse.json(
        { success: false, message: "校区不存在" },
        { status: 404 }
      );
    }

    // 权限检查：非超级管理员只能管理自己学校的校区
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== campus.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权修改其他学校的校区" },
        { status: 403 }
      );
    }

    // 准备更新数据
    const updateData: any = {};

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return NextResponse.json(
          { success: false, message: "校区名称不能为空" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (boundary !== undefined) {
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

      // 构建 GeoJSON 格式的多边形
      const closedBoundary = [...boundary, boundary[0]];
      const polygon: Polygon = {
        type: "Polygon",
        coordinates: [closedBoundary],
      };

      // 计算中心点与标签位置
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

      updateData.boundary = polygon as any;
      updateData.center = centerPoint as any;
      updateData.labelCenter = labelCenterPoint as any;
    }

    // 如果没有要更新的数据
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: "没有要更新的数据" },
        { status: 400 }
      );
    }

    // 更新校区
    const updatedCampus = await prisma.campusArea.update({
      where: { id: campusId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "校区更新成功",
      data: {
        id: updatedCampus.id,
        name: updatedCampus.name,
        schoolId: updatedCampus.schoolId,
        center: updatedCampus.center,
        labelCenter: updatedCampus.labelCenter,
      },
    });
  } catch (error) {
    console.error("更新校区失败:", error);
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
 * DELETE /api/admin/campuses/[id]
 * 删除校区
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireSchoolAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    if (auth.role === "STAFF") {
      return NextResponse.json(
        { success: false, message: "工作人员无权修改校区边界数据。" },
        { status: 403 }
      );
    }

    const campusId = params.id;

    // 获取校区信息
    const campus = await prisma.campusArea.findUnique({
      where: { id: campusId },
    });

    if (!campus) {
      return NextResponse.json(
        { success: false, message: "校区不存在" },
        { status: 404 }
      );
    }

    // 权限检查：非超级管理员只能删除自己学校的校区
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== campus.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权删除其他学校的校区" },
        { status: 403 }
      );
    }

    // 删除校区
    await prisma.campusArea.delete({
      where: { id: campusId },
    });

    return NextResponse.json({
      success: true,
      message: "校区删除成功",
    });
  } catch (error) {
    console.error("删除校区失败:", error);
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
