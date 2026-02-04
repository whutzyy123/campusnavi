import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/schools/[id]/campuses
 * 获取指定学校的校区列表（公开接口，无需认证）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schoolId = params.id;

    if (!schoolId) {
      return NextResponse.json(
        { success: false, message: "缺少学校ID" },
        { status: 400 }
      );
    }

    // 验证学校是否存在
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 获取该学校的所有校区
    const campuses = await prisma.campusArea.findMany({
      where: { schoolId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        boundary: true,
        center: true,
        createdAt: true,
        updatedAt: true,
      },
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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
