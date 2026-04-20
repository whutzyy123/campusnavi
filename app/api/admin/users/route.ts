import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";
import { appRoleToDbRole, dbRoleToAppRole, type AppRole } from "@/lib/role";

const patchUserBodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const deleteUserBodySchema = z.object({
  id: z.string().min(1),
});

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
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const searchParams = request.nextUrl.searchParams;

    // 获取筛选参数
    const roleFilter = searchParams.get("role");
    const schoolIdFilter = searchParams.get("schoolId");
    const search = searchParams.get("search");
    const searchField = searchParams.get("field") === "email" ? "email" : "nickname";

    const whereConditions: Prisma.UserWhereInput[] = [];

    if (roleFilter) {
      const allowed: readonly AppRole[] = ["STUDENT", "ADMIN", "STAFF", "SUPER_ADMIN"];
      if ((allowed as readonly string[]).includes(roleFilter)) {
        whereConditions.push({ role: appRoleToDbRole(roleFilter as AppRole) });
      }
    }

    if (schoolIdFilter) {
      if (schoolIdFilter === "null") {
        whereConditions.push({ schoolId: null });
      } else {
        whereConditions.push({ schoolId: schoolIdFilter });
      }
    }

    if (search && search.trim()) {
      whereConditions.push({
        [searchField]: { contains: search.trim() },
      });
    }

    const where: Prisma.UserWhereInput =
      whereConditions.length > 0 ? { AND: whereConditions } : {};

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const { skip, take } = getPaginationParams(page, limit);

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

    const formattedUsers = users.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      role: dbRoleToAppRole(user.role) ?? "UNKNOWN",
      roleNumber: user.role,
      schoolId: user.schoolId,
      schoolName: user.school?.name || "系统",
      schoolCode: user.school?.schoolCode || null,
      createdAt: user.createdAt.toISOString(),
      status: user.status || "ACTIVE",
    }));

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
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "请求体格式错误" }, { status: 400 });
    }

    const parsed = patchUserBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? "参数无效" },
        { status: 400 }
      );
    }

    const { id, status } = parsed.data;

    if (id === authResult.userId) {
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
      return NextResponse.json({ success: false, message: "用户不存在" }, { status: 404 });
    }

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
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "请求体格式错误" }, { status: 400 });
    }

    const parsed = deleteUserBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? "参数无效" },
        { status: 400 }
      );
    }

    const { id } = parsed.data;

    if (id === authResult.userId) {
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
      return NextResponse.json({ success: false, message: "用户不存在" }, { status: 404 });
    }

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
