import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 * 获取用户列表（按学校和角色筛选）
 * 
 * 查询参数：
 * - schoolId: 学校ID（必填）
 * - role: 角色（可选，1: 学生, 2: 管理员, 3: 工作人员）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const schoolId = searchParams.get("schoolId");
    const role = searchParams.get("role");

    if (!schoolId) {
      return NextResponse.json(
        { success: false, message: "缺少必填参数：schoolId" },
        { status: 400 }
      );
    }

    // 验证学校是否存在
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 构建查询条件
    const where: any = {
      schoolId, // 严格遵循 schoolId 隔离
    };

    if (role) {
      where.role = parseInt(role, 10);
    }

    // 查询用户（不返回密码）
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
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

