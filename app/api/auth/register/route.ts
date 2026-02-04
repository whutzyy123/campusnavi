import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-utils";

/**
 * POST /api/auth/register
 * 用户注册
 * 
 * 请求体：
 * {
 *   email: string,
 *   nickname: string,
 *   password: string,
 *   confirmPassword: string,
 *   schoolId: string,
 *   role: "STUDENT" | "ADMIN" | "STAFF",
 *   invitationCode?: string // ADMIN 或 STAFF 角色必填
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, nickname, password, confirmPassword, schoolId, role, invitationCode } = body;

    // 验证必填字段
    if (!email || !nickname || !password || !confirmPassword || !role) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 学生角色必须提供 schoolId
    if (role === "STUDENT" && !schoolId) {
      return NextResponse.json(
        { success: false, message: "学生角色必须选择学校" },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: "邮箱格式不正确" },
        { status: 400 }
      );
    }

    // 验证密码长度
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: "密码长度至少为 6 位" },
        { status: 400 }
      );
    }

    // 验证密码确认
    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "两次输入的密码不一致" },
        { status: 400 }
      );
    }

    // 验证角色
    const validRoles = ["STUDENT", "ADMIN", "STAFF"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, message: "无效的角色" },
        { status: 400 }
      );
    }

    // ADMIN 或 STAFF 角色必须提供邀请码
    if ((role === "ADMIN" || role === "STAFF") && !invitationCode) {
      return NextResponse.json(
        { success: false, message: "管理员或工作人员角色必须提供邀请码" },
        { status: 400 }
      );
    }

    // 如果提供了邀请码，先验证邀请码（邀请码的 schoolId 是最高权限）
    let invitationCodeRecord = null;
    let finalSchoolId = schoolId; // 最终使用的 schoolId

    if (invitationCode) {
      invitationCodeRecord = await prisma.invitationCode.findUnique({
        where: { code: invitationCode },
        include: {
          school: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invitationCodeRecord) {
        return NextResponse.json(
          { success: false, message: "邀请码不存在" },
          { status: 404 }
        );
      }

      // 检查邀请码是否已使用
      if (invitationCodeRecord.isUsed) {
        return NextResponse.json(
          { success: false, message: "邀请码已被使用" },
          { status: 400 }
        );
      }

      // 检查邀请码是否过期
      if (invitationCodeRecord.expiresAt && new Date() > invitationCodeRecord.expiresAt) {
        return NextResponse.json(
          { success: false, message: "邀请码已过期" },
          { status: 400 }
        );
      }

      // 验证角色匹配
      const expectedRole = invitationCodeRecord.role === 2 ? "ADMIN" : "STAFF";
      if (role !== expectedRole) {
        return NextResponse.json(
          { success: false, message: `邀请码角色不匹配，应为${expectedRole === "ADMIN" ? "校级管理员" : "校内工作人员"}` },
          { status: 400 }
        );
      }

      // 强制使用邀请码中的 schoolId（最高权限）
      finalSchoolId = invitationCodeRecord.schoolId;

      // 如果前端也传入了 schoolId，进行一致性校验
      if (schoolId && schoolId !== finalSchoolId) {
        return NextResponse.json(
          { success: false, message: "邀请码无效或信息不匹配" },
          { status: 400 }
        );
      }
    }

    // 验证学校是否存在（使用最终确定的 schoolId）
    const school = await prisma.school.findUnique({
      where: { id: finalSchoolId },
      select: { id: true, name: true },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 检查邮箱是否已被使用
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "该邮箱已被注册" },
        { status: 409 }
      );
    }


    // 哈希密码
    const hashedPassword = await hashPassword(password);

    // 角色映射：STUDENT -> 1, ADMIN -> 2, STAFF -> 3
    const roleMap: Record<string, number> = {
      STUDENT: 1,
      ADMIN: 2,
      STAFF: 3,
    };

    // 创建用户（使用事务确保数据一致性）
    const user = await prisma.$transaction(async (tx) => {
      // 创建用户（使用最终确定的 schoolId，来自邀请码或用户选择）
      const newUser = await tx.user.create({
        data: {
          email: email.trim().toLowerCase(),
          nickname: nickname.trim(),
          password: hashedPassword,
          schoolId: finalSchoolId, // 永久绑定，不可修改（优先使用邀请码的 schoolId）
          role: roleMap[role],
          phone: null,
        },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          schoolId: true,
        },
      });

      // 如果使用了邀请码，标记为已使用
      if (invitationCodeRecord) {
        await tx.invitationCode.update({
          where: { id: invitationCodeRecord.id },
          data: {
            isUsed: true,
            usedBy: newUser.id,
            usedAt: new Date(),
          },
        });
      }

      return newUser;
    });

    return NextResponse.json({
      success: true,
      message: "注册成功",
      user: {
        id: user.id,
        email: user.email || undefined,
        nickname: user.nickname || "",
        role: role === "STUDENT" ? "STUDENT" : role === "ADMIN" ? "ADMIN" : "STAFF",
        schoolId: user.schoolId,
        schoolName: school.name,
      },
    });
  } catch (error) {
    console.error("注册失败:", error);
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

