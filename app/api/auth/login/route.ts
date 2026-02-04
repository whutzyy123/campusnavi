import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth-utils";

/**
 * POST /api/auth/login
 * 用户登录（邮箱 + 密码）
 * 
 * 请求体：
 * {
 *   email: string,
 *   password: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 验证必填字段
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：email, password" },
        { status: 400 }
      );
    }

    // 查找用户（通过邮箱）
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        nickname: true,
        password: true,
        role: true,
        schoolId: true,
        school: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "邮箱或密码错误" },
        { status: 401 }
      );
    }

    // 验证密码
    if (!user.password) {
      return NextResponse.json(
        { success: false, message: "该账户未设置密码，请先注册" },
        { status: 401 }
      );
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: "邮箱或密码错误" },
        { status: 401 }
      );
    }

    // 角色映射：1 -> STUDENT, 2 -> ADMIN, 3 -> STAFF, 4 -> SUPER_ADMIN
    const roleMap: Record<number, string> = {
      1: "STUDENT",
      2: "ADMIN",
      3: "STAFF",
      4: "SUPER_ADMIN",
    };

    // 角色映射：1 -> STUDENT, 2 -> ADMIN, 3 -> STAFF, 4 -> SUPER_ADMIN
    const userRole = roleMap[user.role] || "STUDENT";
    const isSuperAdmin = userRole === "SUPER_ADMIN";

    return NextResponse.json({
      success: true,
      message: "登录成功",
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: userRole,
        schoolId: user.schoolId || null, // 超级管理员可能为 null
        schoolName: user.school?.name || null, // 超级管理员可能没有学校
      },
    });
  } catch (error) {
    console.error("登录失败:", error);
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

