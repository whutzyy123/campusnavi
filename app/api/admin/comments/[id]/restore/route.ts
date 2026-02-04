import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server-actions";

// PATCH /api/admin/comments/[id]/restore
// 将留言恢复为可见并清空举报次数
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();

    if (!auth.schoolId) {
      return NextResponse.json(
        { success: false, message: "当前管理员未绑定学校" },
        { status: 400 }
      );
    }

    const { id } = params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, message: "留言不存在" },
        { status: 404 }
      );
    }

    if (comment.schoolId !== auth.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权操作其他学校的留言" },
        { status: 403 }
      );
    }

    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data: {
        isHidden: false,
        reportCount: 0,
      },
    });

    return NextResponse.json({
      success: true,
      message: "留言已恢复显示",
      comment: {
        id: updated.id,
        isHidden: updated.isHidden,
        reportCount: updated.reportCount,
      },
    });
  } catch (error) {
    console.error("恢复留言失败:", error);
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


