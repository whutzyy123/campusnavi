import { NextRequest, NextResponse } from "next/server";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 * 从 HTTP Only Cookie 读取认证信息，然后从数据库获取完整用户信息
 */
export async function GET(request: NextRequest) {
  try {
    const authData = await getAuthCookie();

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "auth-me-route",
        hypothesisId: "M1",
        location: "app/api/auth/me/route.ts:GET:authData",
        message: "Auth cookie data when calling /api/auth/me",
        data: { hasAuth: !!authData, userId: authData?.userId ?? null, role: authData?.role ?? null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

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
        { success: false, message: "用户不存在" },
        { status: 404 }
      );
    }

    // 角色映射
    const roleMap: Record<number, string> = {
      1: "STUDENT",
      2: "ADMIN",
      3: "STAFF",
      4: "SUPER_ADMIN",
    };

    const userRole = roleMap[user.role] || "STUDENT";

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        bio: user.bio,
        role: userRole,
        schoolId: user.schoolId || null,
        schoolName: user.school?.name || null,
      },
    });
  } catch (error) {
    console.error("获取用户信息失败:", error);

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "auth-me-route",
        hypothesisId: "M2",
        location: "app/api/auth/me/route.ts:GET:catch",
        message: "Error when handling /api/auth/me",
        data: { errorMessage: error instanceof Error ? error.message : "Unknown error" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

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

