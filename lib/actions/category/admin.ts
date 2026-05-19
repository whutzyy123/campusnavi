"use server";

/**
 * 超管全量分类监控 Server Actions
 * - getAllUniqueCategories：获取系统分类 + 校内分类全量列表
 */

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import type {
  SystemCategoryItem,
  LocalCategoryItem,
  GetAllUniqueCategoriesResult,
} from "@/lib/category";

/**
 * 获取系统分类 + 校内分类全量列表（仅超级管理员）
 * 用于 Super Admin 分类监控页面
 */
export async function getAllUniqueCategories(filters?: {
  keyword?: string;
  schoolId?: string;
}): Promise<GetAllUniqueCategoriesResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }
    if (auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可访问" };
    }

    const keyword = filters?.keyword?.trim();
    const schoolIdFilter = filters?.schoolId || undefined;

    // 1. 系统分类（isGlobal + schoolId null，排除便民公共设施）
    const systemCategories = await prisma.category.findMany({
      where: {
        isGlobal: true,
        schoolId: null,
        isMicroCategory: false,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { pois: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // 2. 校内分类（schoolId !== null，排除便民公共设施）
    const localCategories = await prisma.category.findMany({
      where: {
        schoolId: schoolIdFilter ? schoolIdFilter : { not: null },
        isMicroCategory: false,
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      select: {
        id: true,
        name: true,
        icon: true,
        schoolId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { pois: true } },
        school: { select: { name: true } },
      },
      orderBy: [{ school: { name: "asc" } }, { name: "asc" }],
    });

    // 3. 学校列表（用于筛选下拉）
    const schools = await prisma.school.findMany({
      where: { isActive: true, schoolCode: { not: "system" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    });

    return {
      success: true,
      systemCategories: systemCategories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        poiCount: c._count.pois,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      localCategories: localCategories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        schoolId: c.schoolId!,
        schoolName: c.school?.name ?? "未知",
        poiCount: c._count.pois,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      schools: schools.map((s) => ({ id: s.id, name: s.name })),
    };
  } catch (error) {
    console.error("获取全量分类失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}