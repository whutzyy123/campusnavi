import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

/**
 * POST /api/pois/status
 * 上报 POI 实时状态
 * 
 * 请求体：
 * {
 *   poiId: string,
 *   schoolId: string,
 *   statusType: string, // 如 "拥挤度"
 *   val: number // 1-4: 空闲、正常、拥挤、爆满
 * }
 * 
 * 防刷限制：同一用户对同一POI的上报间隔必须大于30秒
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { poiId, schoolId, statusType, val } = body;

    // 验证必填字段
    if (!poiId || !schoolId || !statusType || val === undefined) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：poiId, schoolId, statusType, val" },
        { status: 400 }
      );
    }

    // 验证状态值（1-4）
    if (![1, 2, 3, 4].includes(val)) {
      return NextResponse.json(
        { success: false, message: "状态值必须是 1-4 之间的整数" },
        { status: 400 }
      );
    }

    // 获取当前用户（用于防刷限制）
    const auth = await getAuthCookie();
    const userId = auth?.userId || null;

    // 防刷限制：检查同一用户对同一POI的上报间隔
    if (userId) {
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const lastReport = await prisma.liveStatus.findFirst({
        where: {
          poiId,
          userId,
          createdAt: {
            gte: thirtySecondsAgo, // 30秒内
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (lastReport) {
        const timeSinceLastReport = Date.now() - lastReport.createdAt.getTime();
        const remainingSeconds = Math.ceil((30 * 1000 - timeSinceLastReport) / 1000);
        return NextResponse.json(
          {
            success: false,
            message: `操作太快了，请稍后再试（还需等待 ${remainingSeconds} 秒）`,
          },
          { status: 429 }
        );
      }
    }

    // 验证 POI 是否存在且属于该学校
    const poi = await prisma.pOI.findFirst({
      where: {
        id: poiId,
        schoolId, // 严格遵循 schoolId 隔离
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在或不属于该学校" },
        { status: 404 }
      );
    }

    // 计算过期时间（当前时间 + 1 小时）
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // 创建状态记录
    const liveStatus = await prisma.liveStatus.create({
      data: {
        poiId,
        schoolId,
        statusType,
        val,
        expiresAt,
        userId, // 记录上报用户ID
      },
    });

    return NextResponse.json({
      success: true,
      message: "状态上报成功",
      status: {
        id: liveStatus.id,
        poiId: liveStatus.poiId,
        statusType: liveStatus.statusType,
        val: liveStatus.val,
        expiresAt: liveStatus.expiresAt.toISOString(),
        createdAt: liveStatus.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("上报状态失败:", error);
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

