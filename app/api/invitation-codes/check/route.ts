import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/invitation-codes/check
 * 检查邀请码是否有效（公开接口，用于注册前置校验）
 * 
 * 请求体：
 * {
 *   code: string, // 邀请码
 *   role?: string // 可选：期望的角色（"ADMIN" 或 "STAFF"）
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, role } = body;

    if (!code || !code.trim()) {
      return NextResponse.json(
        { success: false, message: "邀请码不能为空" },
        { status: 400 }
      );
    }

    // 查找邀请码
    const invitationCode = await prisma.invitationCode.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invitationCode) {
      return NextResponse.json({
        success: false,
        valid: false,
        message: "邀请码无效",
      });
    }

    // 检查是否已被使用
    if (invitationCode.isUsed) {
      return NextResponse.json({
        success: false,
        valid: false,
        message: "邀请码已被使用",
      });
    }

    // 检查是否过期
    if (invitationCode.expiresAt && new Date(invitationCode.expiresAt) < new Date()) {
      return NextResponse.json({
        success: false,
        valid: false,
        message: "邀请码已过期",
      });
    }

    // 如果提供了角色，检查角色是否匹配
    if (role) {
      const expectedRole = role === "ADMIN" ? 2 : role === "STAFF" ? 3 : null;
      if (expectedRole && invitationCode.role !== expectedRole) {
        return NextResponse.json({
          success: false,
          valid: false,
          message: "邀请码角色不匹配",
        });
      }
    }

    // 邀请码有效
    return NextResponse.json({
      success: true,
      valid: true,
      data: {
        schoolId: invitationCode.schoolId,
        schoolName: invitationCode.school.name,
        role: invitationCode.role === 2 ? "ADMIN" : "STAFF",
      },
    });
  } catch (error) {
    console.error("检查邀请码失败:", error);
    return NextResponse.json(
      {
        success: false,
        valid: false,
        message: "服务器内部错误",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
