import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/invitation-codes/verify
 * 验证邀请码
 * 
 * 请求体：
 * {
 *   code: string,
 *   schoolId: string, // 用户选择的学校ID
 *   role: number // 用户选择的角色
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, schoolId, role } = body;

    if (!code || !schoolId || role === undefined) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：code, schoolId, role" },
        { status: 400 }
      );
    }

    // 查找邀请码
    const invitationCode = await prisma.invitationCode.findUnique({
      where: { code },
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
      return NextResponse.json(
        { success: false, message: "邀请码不存在" },
        { status: 404 }
      );
    }

    // 检查是否已使用
    if (invitationCode.isUsed) {
      return NextResponse.json(
        { success: false, message: "邀请码已被使用" },
        { status: 400 }
      );
    }

    // 检查是否过期
    if (invitationCode.expiresAt && new Date() > invitationCode.expiresAt) {
      return NextResponse.json(
        { success: false, message: "邀请码已过期" },
        { status: 400 }
      );
    }

    // 检查角色是否匹配
    if (invitationCode.role !== role) {
      return NextResponse.json(
        { success: false, message: "邀请码角色不匹配" },
        { status: 400 }
      );
    }

    // 检查学校是否匹配
    if (invitationCode.schoolId !== schoolId) {
      return NextResponse.json(
        { success: false, message: "邀请码所属学校与选择学校不匹配" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "邀请码验证通过",
      invitationCode: {
        id: invitationCode.id,
        code: invitationCode.code,
        role: invitationCode.role,
        schoolId: invitationCode.schoolId,
        schoolName: invitationCode.school.name,
      },
    });
  } catch (error) {
    console.error("验证邀请码失败:", error);
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

