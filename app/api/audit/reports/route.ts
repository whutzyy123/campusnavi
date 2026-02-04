import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/audit/reports
 * 获取被举报的 POI 列表（管理员审核用）
 * 
 * 查询参数：
 * - schoolId: 学校ID（可选，管理员只能查看本校的）
 * - minReportCount: 最小举报次数（默认 1）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const schoolId = searchParams.get("schoolId");
    const minReportCount = parseInt(searchParams.get("minReportCount") || "1", 10);

    // 构建查询条件
    const where: any = {
      reportCount: {
        gte: minReportCount, // 至少被举报 minReportCount 次
      },
    };

    // 如果提供了 schoolId，只查询该学校的 POI
    if (schoolId) {
      where.schoolId = schoolId;
    }

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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

