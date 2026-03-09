import { NextRequest, NextResponse } from "next/server";
import { getMergedCategories } from "@/lib/category-utils";
import { prisma } from "@/lib/prisma";
import { CATEGORY_GROUP_CONVENIENCE, CATEGORY_GROUP_REGULAR } from "@/types/category";

export const dynamic = "force-dynamic";

/**
 * GET /api/categories?schoolId=xxx
 * 公开接口：获取指定学校的分类列表（常规 + 便民公共设施），用于地图筛选面板
 */
export async function GET(request: NextRequest) {
  try {
    const schoolId = request.nextUrl.searchParams.get("schoolId");

    if (!schoolId) {
      return NextResponse.json(
        { success: false, message: "缺少 schoolId 参数" },
        { status: 400 }
      );
    }

    const mergedCategories = await getMergedCategories(schoolId);
    const regular = mergedCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));

    const convenienceCategories = await prisma.category.findMany({
      where: { isMicroCategory: true, schoolId: null },
      select: { id: true, name: true, icon: true },
      orderBy: { createdAt: "asc" },
    });
    const convenience = convenienceCategories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
    }));

    return NextResponse.json({
      success: true,
      data: { [CATEGORY_GROUP_REGULAR]: regular, [CATEGORY_GROUP_CONVENIENCE]: convenience },
    });
  } catch (error) {
    console.error("获取分类列表失败:", error);
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
