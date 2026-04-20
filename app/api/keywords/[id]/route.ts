import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/keywords/:id
 * 删除屏蔽词（仅限超级管理员）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const { id } = params;

    // 验证屏蔽词是否存在
    const keyword = await prisma.sensitiveWord.findUnique({
      where: { id },
    });

    if (!keyword) {
      return NextResponse.json(
        { success: false, message: "屏蔽词不存在" },
        { status: 404 }
      );
    }

    // 删除屏蔽词
    await prisma.sensitiveWord.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "屏蔽词删除成功",
    });
  } catch (error) {
    console.error("删除屏蔽词失败:", error);
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

