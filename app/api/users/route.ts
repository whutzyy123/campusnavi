import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSchoolAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const LIST_USER_ROLES = new Set([1, 2, 3]);

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
    const authResult = await requireSchoolAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    const searchParams = request.nextUrl.searchParams;
    const schoolIdParam = searchParams.get("schoolId");
    const role = searchParams.get("role");

    const schoolId = auth.role === "SUPER_ADMIN" ? schoolIdParam : auth.schoolId;
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

    const where: Prisma.UserWhereInput = {
      schoolId,
    };

    if (role !== null && role !== "") {
      const roleNum = parseInt(role, 10);
      if (!Number.isInteger(roleNum) || !LIST_USER_ROLES.has(roleNum)) {
        return NextResponse.json(
          { success: false, message: "无效的角色参数，允许值：1（学生）、2（管理员）、3（工作人员）" },
          { status: 400 }
        );
      }
      where.role = roleNum;
    }

    // 查询用户（不返回密码）
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
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

