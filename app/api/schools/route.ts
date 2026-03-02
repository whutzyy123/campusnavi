import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/schools
 * 获取所有学校列表（带聚合数据，用于超级管理员后台）
 */
export async function GET() {
  try {
    const schools = await prisma.school.findMany({
      where: {
        schoolCode: {
          not: "system", // 排除系统学校
        },
      },
      take: 200,
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            pois: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      schools: schools.map((school) => ({
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
        isActive: school.isActive,
        userCount: school._count.users,
        poiCount: school._count.pois,
        createdAt: school.createdAt.toISOString(),
        updatedAt: school.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("获取学校列表失败:", error);
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

