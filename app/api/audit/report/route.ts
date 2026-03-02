import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateContent } from "@/lib/content-validator";

/**
 * POST /api/audit/report
 * 用户举报 POI
 * 
 * 请求体：
 * {
 *   poiId: string,
 *   reason: string, // "定位不准" | "信息错误" | "有害内容"
 *   description?: string // 可选描述
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { poiId, reason, description } = body;

    // 验证必填字段
    if (!poiId || !reason) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：poiId, reason" },
        { status: 400 }
      );
    }

    // 验证举报原因
    const validReasons = ["定位不准", "信息错误", "有害内容"];
    if (!validReasons.includes(reason)) {
      return NextResponse.json(
        { success: false, message: "无效的举报原因" },
        { status: 400 }
      );
    }

    // 校验内容是否包含屏蔽词
    try {
      await validateContent(reason, { checkNumbers: false });
      if (description) {
        await validateContent(description, { checkNumbers: true });
      }
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "内容包含敏感词汇，请修改后重试。",
        },
        { status: 400 }
      );
    }

    // 注意：在实际项目中，应该使用 JWT 或 Session 来获取当前用户
    // 这里为了简化，允许匿名举报（但会记录 userId 如果提供）
    const userId = body.userId || null; // 可选，允许匿名举报

    // 验证 POI 是否存在
    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: {
        id: true,
        schoolId: true,
        reportCount: true,
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在" },
        { status: 404 }
      );
    }

    // 使用事务更新 POI 的 reportCount
    const updatedPoi = await prisma.$transaction(async (tx) => {
      // 更新 POI 的 reportCount
      const updated = await tx.pOI.update({
        where: { id: poiId },
        data: {
          reportCount: {
            increment: 1,
          },
        },
        select: {
          id: true,
          reportCount: true,
        },
      });

      // 这里可以创建一个 Report 记录表来存储详细举报信息（可选）
      // 为了简化，我们只更新 reportCount

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: "举报成功，感谢您的反馈",
      poi: {
        id: updatedPoi.id,
        reportCount: updatedPoi.reportCount,
        isHidden: updatedPoi.reportCount >= 3, // 自动隐藏策略
      },
    });
  } catch (error) {
    console.error("举报失败:", error);
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

