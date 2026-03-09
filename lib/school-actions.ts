"use server";

/**
 * 学校管理 Server Actions
 * 超级管理员专用：切换学校状态、删除学校、获取学校列表（含统计）
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";

export interface SchoolWithStats {
  id: string;
  name: string;
  schoolCode: string;
  isActive: boolean;
  userCount: number;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 获取所有学校列表（含用户数、POI 数）
 * 不按用户数过滤，确保 0 用户的学校也会返回（Left Join 语义）
 */
export async function getSchoolsWithStats(): Promise<
  { success: true; data: SchoolWithStats[] } | { success: false; error: string }
> {
  try {
    const schools = await prisma.school.findMany({
      where: {
        schoolCode: { not: "system" },
      },
      take: 200,
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { users: true, pois: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: schools.map((s) => ({
        id: s.id,
        name: s.name,
        schoolCode: s.schoolCode,
        isActive: s.isActive,
        userCount: s._count.users,
        poiCount: s._count.pois,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("getSchoolsWithStats 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取学校列表失败",
    };
  }
}

export type SchoolStatus = "ACTIVE" | "INACTIVE";

export interface SchoolActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 校验当前用户是否为超级管理员（role === 4）
 */
async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });

  if (!user) {
    return { ok: false, error: "用户不存在" };
  }

  if (user.role !== 4) {
    return { ok: false, error: "权限不足，仅超级管理员可执行此操作" };
  }

  return { ok: true, userId: auth.userId };
}

/**
 * 切换学校状态（ACTIVE / INACTIVE）
 * 超级管理员专用
 */
export async function updateSchoolStatus(
  schoolId: string,
  status: SchoolStatus
): Promise<SchoolActionResult> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return { success: false, error: "无效的状态，必须是 ACTIVE 或 INACTIVE" };
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, isActive: true },
    });

    if (!school) {
      return { success: false, error: "学校不存在" };
    }

    const isActive = status === "ACTIVE";

    const updated = await prisma.school.update({
      where: { id: schoolId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: {
        ...updated,
        status: updated.isActive ? "ACTIVE" : "INACTIVE",
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("updateSchoolStatus 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新学校状态失败",
    };
  }
}

/**
 * 永久删除学校
 * 超级管理员专用
 * Prisma 已配置 onDelete: Cascade，删除 School 时会自动级联删除：
 * - CampusArea, User, POI, RouteEdge, LiveStatus, InvitationCode, Comment, Category, CategoryOverride
 */
export async function deleteSchool(schoolId: string): Promise<SchoolActionResult> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, schoolCode: true },
    });

    if (!school) {
      return { success: false, error: "学校不存在" };
    }

    await prisma.school.delete({
      where: { id: schoolId },
    });

    return {
      success: true,
      data: {
        message: `学校 "${school.name}" (${school.schoolCode}) 及其所有关联数据已永久删除`,
        deletedId: school.id,
      },
    };
  } catch (err) {
    console.error("deleteSchool 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除学校失败",
    };
  }
}
