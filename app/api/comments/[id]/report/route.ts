import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

// 举报留言：登录用户可用，达到一定阈值自动隐藏
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json(
        { success: false, message: "未登录用户不能举报留言" },
        { status: 401 }
      );
    }

    const { id } = params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        isHidden: true,
        reportCount: true,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, message: "留言不存在" },
        { status: 404 }
      );
    }

    // 多租户安全：除超级管理员外，仅允许举报本校留言
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId && auth.schoolId !== comment.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权举报其他学校的留言" },
        { status: 403 }
      );
    }

    // 使用事务确保原子性操作
    const result = await prisma.$transaction(async (tx) => {
      // 先递增举报次数
      const updated = await tx.comment.update({
        where: { id: comment.id },
        data: {
          reportCount: {
            increment: 1,
          },
        },
        select: {
          id: true,
          reportCount: true,
          isHidden: true,
        },
      });

      // 检查是否达到隐藏阈值（5次及以上）
      let finalIsHidden = updated.isHidden;
      if (updated.reportCount >= 5 && !updated.isHidden) {
        // 达到阈值，自动隐藏
        await tx.comment.update({
          where: { id: updated.id },
          data: {
            isHidden: true,
          },
        });
        finalIsHidden = true;
      }

      return {
        reportCount: updated.reportCount,
        isHidden: finalIsHidden,
        isAutoHidden: updated.reportCount >= 5 && !comment.isHidden,
      };
    });

    // 根据举报次数返回不同的反馈信息
    let message = "举报已收到，管理员将进行审核";
    if (result.isAutoHidden) {
      message = "该内容已被众包屏蔽（举报次数达到5次）";
    } else if (result.reportCount === 4) {
      message = "举报已收到，再收到1次举报将自动屏蔽";
    }

    return NextResponse.json({
      success: true,
      message,
      reportCount: result.reportCount,
      isHidden: result.isHidden,
      isAutoHidden: result.isAutoHidden,
    });
  } catch (error) {
    console.error("举报留言失败:", error);
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


