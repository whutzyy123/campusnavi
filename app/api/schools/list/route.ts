import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIpFromNextRequest } from "@/lib/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/schools/list
 * 获取所有学校列表（用于学校切换器）；公开，带 IP 限流（与 getSchoolsList 一致）
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIpFromNextRequest(request);
    const ok = await consumeRateLimit(`schools:list:ip:${ip}`, 120, 60 * 1000);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

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
        centerLat: true,
        centerLng: true,
      },
      orderBy: {
        name: "asc",
      },
      take: 200,
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
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
