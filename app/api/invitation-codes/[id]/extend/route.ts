import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/invitation-codes/:id/extend
 * 延长邀请码有效期（延长7天）
 * 
 * 权限：只有发放人或超级管理员才能延长有效期
 */
export async function PATCH(
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
        issuerId: true,
        isUsed: true,
        expiresAt: true,
      },
    });

    if (!invitationCode) {
      return NextResponse.json(
        { success: false, message: "邀请码不存在" },
        { status: 404 }
      );
    }

    // 如果已使用，不能延长
    if (invitationCode.isUsed) {
      return NextResponse.json(
        { success: false, message: "已使用的邀请码不能延长有效期" },
        { status: 400 }
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

    // 权限校验：只有发放人或超级管理员才能延长
    const isSuperAdmin = currentUser.role === 4;
    const isIssuer = invitationCode.issuerId === userId;

    if (!isSuperAdmin && !isIssuer) {
      return NextResponse.json(
        { success: false, message: "无权延长此邀请码的有效期" },
        { status: 403 }
      );
    }

    // 计算新的过期时间（延长7天）
    const currentExpiresAt = invitationCode.expiresAt ? new Date(invitationCode.expiresAt) : new Date();
    const newExpiresAt = new Date(currentExpiresAt);
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    // 更新过期时间
    const updated = await prisma.invitationCode.update({
      where: { id: params.id },
      data: {
        expiresAt: newExpiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      message: "有效期已延长7天",
      invitationCode: {
        id: updated.id,
        expiresAt: updated.expiresAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("延长有效期失败:", error);
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

