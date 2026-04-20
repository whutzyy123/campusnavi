import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats
 * 获取系统统计数据（仅超级管理员）
 */
export async function GET() {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    // 总注册用户数
    const totalUsers = await prisma.user.count();

    // 已入驻学校总数
    const totalSchools = await prisma.school.count({
      where: {
        schoolCode: {
          not: "system", // 排除系统学校
        },
      },
    });

    // 今日新增 POI 总数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPOIs = await prisma.pOI.count({
      where: {
        createdAt: {
          gte: today,
        },
      },
    });

    // 待审核举报总数（reportCount >= 1）
    const pendingReports = await prisma.pOI.count({
      where: {
        reportCount: {
          gte: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers,
        totalSchools,
        todayPOIs,
        pendingReports,
      },
    });
  } catch (error) {
    console.error("获取统计数据失败:", error);
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

