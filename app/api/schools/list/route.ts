import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/schools/list
 * 获取所有学校列表（用于学校切换器）
 */
export async function GET() {
  try {
    const schools = await prisma.school.findMany({
      where: {
        isActive: true, // 只返回激活的学校
        schoolCode: {
          not: "system", // 排除系统学校
        },
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        boundary: true,
        centerLat: true,
        centerLng: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      schools,
    });
  } catch (error) {
    console.error("获取学校列表失败:", error);
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

