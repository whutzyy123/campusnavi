import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit/reports
 * 获取被举报的 POI 列表（校级管理员/工作人员审核用，超管不参与）
 * 查询参数：schoolId（必填）, minReportCount?（默认 1）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSessionJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    if (auth.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" },
        { status: 403 }
      );
    }
    if (auth.role !== "ADMIN" && auth.role !== "STAFF") {
      return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const schoolId = searchParams.get("schoolId");
    const minReportCount = parseInt(searchParams.get("minReportCount") || "1", 10);

    if (!schoolId?.trim()) {
      return NextResponse.json({ success: false, message: "schoolId 为必填项" }, { status: 400 });
    }
    if (!auth.schoolId || auth.schoolId !== schoolId) {
      return NextResponse.json({ success: false, message: "只能查看本校数据" }, { status: 403 });
    }

    const where: Prisma.POIWhereInput = {
      reportCount: {
        gte: minReportCount,
      },
      schoolId: schoolId.trim(),
    };

    // 查询被举报的 POI
    const pois = await prisma.pOI.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        reportCount: "desc", // 按举报次数降序
      },
    });

    return NextResponse.json({
      success: true,
      pois: pois.map((poi) => ({
        id: poi.id,
        name: poi.name,
        category: poi.category,
        description: poi.description,
        lat: poi.lat,
        lng: poi.lng,
        reportCount: poi.reportCount,
        isOfficial: poi.isOfficial,
        schoolId: poi.schoolId,
        schoolName: poi.school.name,
        createdAt: poi.createdAt.toISOString(),
        updatedAt: poi.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("获取举报列表失败:", error);
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

