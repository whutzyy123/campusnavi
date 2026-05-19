"use server";

/**
 * 全局分类管理 Server Actions
 * - getGlobalCategories：获取全局分类列表（超管）
 * - createGlobalCategory：创建全局分类（超管）
 * - deleteGlobalCategory：删除全局分类（超管）
 */

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import { getPaginationMeta } from "@/lib/core/utils";
import type { GlobalCategoryItem } from "@/lib/category";

/**
 * 获取全局分类列表（仅超级管理员）
 * 分页：固定每页 10 条
 */
export async function getGlobalCategories(params: {
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  data?: GlobalCategoryItem[];
  pagination?: { total: number; pageCount: number; currentPage: number };
  error?: string;
}> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可访问" };
    }

    const PAGE_SIZE = params.limit ?? 10;
    const page = Math.max(1, params.page ?? 1);
    const skip = (page - 1) * PAGE_SIZE;

    const [total, categories] = await Promise.all([
      prisma.category.count({
        where: { isGlobal: true, schoolId: null },
      }),
      prisma.category.findMany({
        where: { isGlobal: true, schoolId: null },
        select: {
          id: true,
          name: true,
          icon: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { pois: true } },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take: PAGE_SIZE,
      }),
    ]);

    const pagination = getPaginationMeta(total, page, PAGE_SIZE);
    const data: GlobalCategoryItem[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      poiCount: c._count.pois,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return { success: true, data, pagination };
  } catch (err) {
    console.error("getGlobalCategories 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取全局分类列表失败",
    };
  }
}

/**
 * 创建全局分类（仅超级管理员）
 */
export async function createGlobalCategory(input: {
  name: string;
  icon?: string | null;
}): Promise<{ success: boolean; data?: GlobalCategoryItem; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可创建全局分类" };
    }

    const name = input.name?.trim();
    if (!name) return { success: false, error: "分类名称不能为空" };
    if (name.length > 50) return { success: false, error: "分类名称过长（最多 50 字）" };

    const existing = await prisma.category.findFirst({
      where: { isGlobal: true, schoolId: null, name },
    });
    if (existing) return { success: false, error: "该全局分类名称已存在" };

    const category = await prisma.category.create({
      data: {
        schoolId: null,
        name,
        icon: input.icon?.trim() || null,
        isGlobal: true,
      },
    });

    return {
      success: true,
      data: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        poiCount: 0,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("createGlobalCategory 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

/**
 * 删除全局分类（仅超级管理员）
 * 删除后 POI 的 categoryId 会置为 null（onDelete: SetNull）
 */
export async function deleteGlobalCategory(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可访问" };
    }

    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, isGlobal: true, schoolId: true, isMicroCategory: true },
    });

    if (!existing) {
      return { success: false, error: "分类不存在" };
    }

    if (!existing.isGlobal || existing.schoolId !== null || existing.isMicroCategory) {
      return { success: false, error: "只能删除全局常规分类" };
    }

    await prisma.category.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    console.error("deleteGlobalCategory 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}