"use server";

/**
 * 学校分类写入 Server Actions
 * - createSchoolCategory：创建校内私有分类
 */

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import type { MergedCategory } from "@/lib/content/category-utils";

/**
 * 创建学校分类（校内私有分类，非全局）
 */
export async function createSchoolCategory(input: {
  schoolId: string;
  name: string;
  icon?: string | null;
}): Promise<{ success: boolean; data?: MergedCategory; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) return { success: false, error: "请先登录" };
    const isAdmin = auth.role === "ADMIN" || auth.role === "STAFF" || auth.role === "SUPER_ADMIN";
    if (!isAdmin) return { success: false, error: "仅管理员可创建分类" };
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== input.schoolId) {
      return { success: false, error: "无权为其他学校创建分类" };
    }

    const name = input.name?.trim();
    if (!name) return { success: false, error: "分类名称不能为空" };
    if (name.length > 50) return { success: false, error: "分类名称过长（最多 50 字）" };

    const existing = await prisma.category.findUnique({
      where: { schoolId_name: { schoolId: input.schoolId, name } },
    });
    if (existing) return { success: false, error: "该分类名称已存在" };

    const category = await prisma.category.create({
      data: {
        schoolId: input.schoolId,
        name,
        icon: input.icon?.trim() || null,
        isGlobal: false,
        isMicroCategory: false,
      },
    });

    const poiCount = await prisma.pOI.count({
      where: { categoryId: category.id, schoolId: input.schoolId },
    });

    return {
      success: true,
      data: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        isGlobal: false,
        isHidden: false,
        customName: null,
        poiCount,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("createSchoolCategory 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建分类失败",
    };
  }
}