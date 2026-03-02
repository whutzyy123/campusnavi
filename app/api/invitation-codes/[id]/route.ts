import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/invitation-codes/:id
 * 作废邀请码（硬删除）
 * 
 * 权限：只有发放人或超级管理员才能作废邀请码
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 获取当前用户（从请求体中获取）
    const body = await request.json().catch(() => ({}));
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "未授权" },
        { status: 401 }
      );
    }

    // 查找邀请码
    const invitationCode = await prisma.invitationCode.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        createdByUserId: true,
        status: true,
        code: true,
      },
    });

    if (!invitationCode) {
      return NextResponse.json(
        { success: false, message: "邀请码不存在" },
        { status: 404 }
      );
    }

    // 获取当前用户信息
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      );
    }

    // 权限校验：只有发放人或超级管理员才能作废
    const isSuperAdmin = currentUser.role === 4;
    const isIssuer = invitationCode.createdByUserId === userId;

    if (!isSuperAdmin && !isIssuer) {
      return NextResponse.json(
        { success: false, message: "无权作废此邀请码" },
        { status: 403 }
      );
    }

    // 硬删除邀请码
    await prisma.invitationCode.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: "邀请码已作废",
    });
  } catch (error) {
    console.error("作废邀请码失败:", error);
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

