import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getAuthCookie, removeAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 * 从 HTTP Only Cookie 读取认证信息，然后从数据库获取完整用户信息
 */
export async function GET(request: NextRequest) {
  try {
    const authData = await getAuthCookie();

    if (!authData) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    // 从数据库获取完整用户信息
    const user = await prisma.user.findUnique({
      where: { id: authData.userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        bio: true,
        avatar: true,
        lastProfileUpdateAt: true,
        role: true,
        schoolId: true,
        status: true,
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
        { success: false, message: "用户不存在" },
        { status: 404 }
      );
    }

    if (user.status === "INACTIVE") {
      await removeAuthCookie();
      return NextResponse.json(
        { success: false, message: "该账户已被停用" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        bio: user.bio,
        avatar: user.avatar || null,
        lastProfileUpdateAt: user.lastProfileUpdateAt?.toISOString() || null,
        role: authData.role,
        schoolId: user.schoolId || null,
        schoolName: user.school?.name || null,
      },
    });
  } catch (error) {
    console.error("获取用户信息失败:", error);

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
