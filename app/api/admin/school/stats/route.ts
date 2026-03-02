import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/school/stats
 * 获取校级管理员所在学校的统计数据
 * 需要从请求头或 Cookie 中获取用户信息（这里简化处理，实际应该从认证中间件获取）
 */
export async function GET(request: NextRequest) {
  try {
    // 从查询参数获取 schoolId（实际应该从认证中间件获取）
    const searchParams = request.nextUrl.searchParams;
    const schoolId = searchParams.get("schoolId");

    if (!schoolId) {
      return NextResponse.json(
        { success: false, message: "缺少 schoolId 参数" },
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

    // 本校用户总数（排除超级管理员）
    const totalUsers = await prisma.user.count({
      where: {
        schoolId: schoolId,
        role: {
          not: 4, // 排除超级管理员
        },
      },
    });

    // 本校 POI 总数
    const totalPOIs = await prisma.pOI.count({
      where: {
        schoolId: schoolId,
      },
    });

    // 待审核举报数（reportCount >= 1）
    const pendingReports = await prisma.pOI.count({
      where: {
        schoolId: schoolId,
        reportCount: {
          gte: 1,
        },
      },
    });

    // 今日新增 POI 数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPOIs = await prisma.pOI.count({
      where: {
        schoolId: schoolId,
        createdAt: {
          gte: today,
        },
      },
    });

    return NextResponse.json({
      success: true,
      stats: {
        schoolName: school.name,
        totalUsers,
        totalPOIs,
        pendingReports,
        todayPOIs,
      },
    });
  } catch (error) {
    console.error("获取学校统计数据失败:", error);
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

