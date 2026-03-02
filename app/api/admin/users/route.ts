import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";
import { getAuthCookie } from "@/lib/auth-server-actions";

/**
 * 验证超级管理员权限（仅限 role=4）
 */
async function requireSuperAdmin() {
  const auth = await getAuthCookie();
  if (!auth) {
    return { ok: false as const, status: 401, message: "未授权" };
  }
  if (auth.role !== "SUPER_ADMIN") {
    return { ok: false as const, status: 403, message: "权限不足，仅限超级管理员访问" };
  }
  return { ok: true as const, auth };
}

/**
 * GET /api/admin/users
 * 获取所有用户数据（仅限超级管理员）
 *
 * 查询参数：
 * - role: 角色筛选（可选）
 * - schoolId: 学校筛选（可选）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, message: authResult.message },
        { status: authResult.status }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // 获取筛选参数
    const roleFilter = searchParams.get("role");
    const schoolIdFilter = searchParams.get("schoolId");
    const search = searchParams.get("search");
    const searchField = searchParams.get("field") === "email" ? "email" : "nickname";

    // 构建查询条件
    const whereConditions: any[] = [];
    
    // 角色筛选
    if (roleFilter) {
      // 角色映射：STUDENT=1, ADMIN=2, STAFF=3, SUPER_ADMIN=4
      const roleMap: Record<string, number> = {
        STUDENT: 1,
        ADMIN: 2,
        STAFF: 3,
        SUPER_ADMIN: 4,
      };
      if (roleMap[roleFilter]) {
        whereConditions.push({ role: roleMap[roleFilter] });
      }
    }

    // 学校筛选
    if (schoolIdFilter) {
      if (schoolIdFilter === "null") {
        whereConditions.push({ schoolId: null });
      } else {
        whereConditions.push({ schoolId: schoolIdFilter });
      }
    }

    // 搜索功能：根据指定字段进行模糊搜索
    if (search && search.trim()) {
      whereConditions.push({
        [searchField]: { contains: search.trim() },
      });
    }

    // 构建最终的 where 条件
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // 获取分页参数
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const { skip, take } = getPaginationParams(page, limit);

    // 并行查询：总数和分页数据（仅取所需字段）
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          nickname: true,
          email: true,
          role: true,
          schoolId: true,
          createdAt: true,
          status: true,
          school: {
            select: {
              id: true,
              name: true,
              schoolCode: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
    ]);

    // 格式化返回数据
    const formattedUsers = users.map((user) => {
      // 角色映射：1=STUDENT, 2=ADMIN, 3=STAFF, 4=SUPER_ADMIN
      const roleMap: Record<number, string> = {
        1: "STUDENT",
        2: "ADMIN",
        3: "STAFF",
        4: "SUPER_ADMIN",
      };

      return {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        role: roleMap[user.role] || "UNKNOWN",
        roleNumber: user.role,
        schoolId: user.schoolId,
        schoolName: user.school?.name || "系统",
        schoolCode: user.school?.schoolCode || null,
        createdAt: user.createdAt.toISOString(),
        status: user.status || "ACTIVE",
      };
    });

    // 计算分页元数据
    const pagination = getPaginationMeta(total, page, limit);

    return NextResponse.json({
      success: true,
      data: formattedUsers,
      pagination,
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

/**
 * PATCH /api/admin/users
 * 切换用户状态（停用/激活），仅限超级管理员
 * 请求体：{ id: string, status: "ACTIVE" | "INACTIVE" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, message: authResult.message },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, message: "缺少 id 或 status" },
        { status: 400 }
      );
    }

    if (status !== "ACTIVE" && status !== "INACTIVE") {
      return NextResponse.json(
        { success: false, message: "status 必须为 ACTIVE 或 INACTIVE" },
        { status: 400 }
      );
    }

    // 禁止停用自己
    if (id === authResult.auth.userId) {
      return NextResponse.json(
        { success: false, message: "不能停用自己的账户" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      );
    }

    // 禁止停用其他超级管理员
    if (targetUser.role === 4) {
      return NextResponse.json(
        { success: false, message: "不能停用其他超级管理员" },
        { status: 403 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: status === "ACTIVE" ? "已激活" : "已停用",
    });
  } catch (error) {
    console.error("更新用户状态失败:", error);
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

/**
 * DELETE /api/admin/users
 * 永久删除用户及其关联数据，仅限超级管理员
 * 请求体：{ id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return NextResponse.json(
        { success: false, message: authResult.message },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "缺少 id" },
        { status: 400 }
      );
    }

    // 禁止删除自己
    if (id === authResult.auth.userId) {
      return NextResponse.json(
        { success: false, message: "不能删除自己的账户" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, nickname: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      );
    }

    // 禁止删除其他超级管理员
    if (targetUser.role === 4) {
      return NextResponse.json(
        { success: false, message: "不能删除其他超级管理员" },
        { status: 403 }
      );
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `用户 "${targetUser.nickname || id}" 已永久删除`,
    });
  } catch (error) {
    console.error("删除用户失败:", error);
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
