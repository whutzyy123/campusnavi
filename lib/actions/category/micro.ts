"use server";

/**
 * 便民公共设施管理 Server Actions
 * - getMicroCategories：获取便民公共设施列表
 * - createMicroCategory：创建便民公共设施
 * - updateMicroCategory：更新便民公共设施
 * - deleteMicroCategory：删除便民公共设施
 */

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import type { MicroCategoryItem, CategoryActionResult } from "@/lib/category";

/**
 * 校验当前用户是否为超级管理员
 */
async function requireSuperAdminForMicroCategory(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }

  if (auth.role !== "SUPER_ADMIN") {
    return { ok: false, error: "仅超级管理员可管理便民公共设施" };
  }

  return { ok: true };
}

/**
 * 获取所有便民公共设施分类
 * 条件：isMicroCategory === true 且 schoolId === null
 * 无需鉴权，供校管创建 POI、用户筛选等场景使用
 */
export async function getMicroCategories(): Promise<{
  success: boolean;
  data?: MicroCategoryItem[];
  error?: string;
}> {
  try {
    const categories = await prisma.category.findMany({
      where: {
        isMicroCategory: true,
        schoolId: null,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { pois: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const data: MicroCategoryItem[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      poiCount: c._count.pois,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return { success: true, data };
  } catch (error) {
    console.error("获取便民公共设施失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 创建便民公共设施分类
 * 权限：仅 SUPER_ADMIN
 * 多租户：schoolId 强制为 null，忽略客户端传入
 */
export async function createMicroCategory(input: {
  name: string;
  icon?: string | null;
}): Promise<CategoryActionResult> {
  try {
    const authResult = await requireSuperAdminForMicroCategory();
    if (!authResult.ok) {
      return { success: false, message: authResult.error };
    }

    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      return { success: false, message: "分类名称不能为空" };
    }

    if (trimmedName.length > 50) {
      return { success: false, message: "分类名称过长（最多 50 字）" };
    }

    // 检查是否已存在同名便民公共设施
    const existing = await prisma.category.findFirst({
      where: {
        isMicroCategory: true,
        schoolId: null,
        name: trimmedName,
      },
    });

    if (existing) {
      return { success: false, message: "该便民公共设施名称已存在" };
    }

    // 创建时强制 schoolId 为 null
    const category = await prisma.category.create({
      data: {
        schoolId: null,
        name: trimmedName,
        icon: input.icon?.trim() || null,
        isGlobal: false,
        isMicroCategory: true,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { pois: true } },
      },
    });

    return {
      success: true,
      message: "便民公共设施创建成功",
      data: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        poiCount: category._count.pois,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("创建便民公共设施失败:", error);
    return {
      success: false,
      message: "创建失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 更新便民公共设施分类
 * 权限：仅 SUPER_ADMIN
 * 仅允许更新 isMicroCategory === true 且 schoolId === null 的分类
 */
export async function updateMicroCategory(
  id: string,
  input: { name?: string; icon?: string | null }
): Promise<CategoryActionResult> {
  try {
    const authResult = await requireSuperAdminForMicroCategory();
    if (!authResult.ok) {
      return { success: false, message: authResult.error };
    }

    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, isMicroCategory: true, schoolId: true, name: true },
    });

    if (!existing) {
      return { success: false, message: "分类不存在" };
    }

    if (!existing.isMicroCategory || existing.schoolId !== null) {
      return { success: false, message: "只能更新便民公共设施" };
    }

    const trimmedName = input.name?.trim();
    if (trimmedName !== undefined) {
      if (!trimmedName) {
        return { success: false, message: "分类名称不能为空" };
      }
      if (trimmedName.length > 50) {
        return { success: false, message: "分类名称过长（最多 50 字）" };
      }
      // 若改名，检查是否与其它便民公共设施重名
      const duplicate = await prisma.category.findFirst({
        where: {
          isMicroCategory: true,
          schoolId: null,
          name: trimmedName,
          id: { not: id },
        },
      });
      if (duplicate) {
        return { success: false, message: "该便民公共设施名称已存在" };
      }
    }

    const updateData: { name?: string; icon?: string | null } = {};
    if (trimmedName !== undefined) updateData.name = trimmedName;
    if (input.icon !== undefined) updateData.icon = input.icon?.trim() || null;

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { pois: true } },
      },
    });

    return {
      success: true,
      message: "便民公共设施更新成功",
      data: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        poiCount: category._count.pois,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("更新便民公共设施失败:", error);
    return {
      success: false,
      message: "更新失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 删除便民公共设施分类
 * 权限：仅 SUPER_ADMIN
 * 仅允许删除 isMicroCategory === true 且 schoolId === null 的分类
 */
export async function deleteMicroCategory(id: string): Promise<CategoryActionResult> {
  try {
    const authResult = await requireSuperAdminForMicroCategory();
    if (!authResult.ok) {
      return { success: false, message: authResult.error };
    }

    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, isMicroCategory: true, schoolId: true, _count: { select: { pois: true } } },
    });

    if (!existing) {
      return { success: false, message: "分类不存在" };
    }

    if (!existing.isMicroCategory || existing.schoolId !== null) {
      return { success: false, message: "只能删除便民公共设施" };
    }

    await prisma.category.delete({
      where: { id },
    });

    return { success: true, message: "便民公共设施已删除" };
  } catch (error) {
    console.error("删除便民公共设施失败:", error);
    return {
      success: false,
      message: "删除失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}