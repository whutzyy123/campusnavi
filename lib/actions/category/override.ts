"use server";

/**
 * 分类覆盖 Server Actions
 * - updateCategoryOverride：更新分类覆盖（隐藏/自定义名称）
 * - removeCategoryOverrideAction：删除分类覆盖
 */

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import { upsertCategoryOverride, removeCategoryOverride } from "@/lib/content/category-utils";
import { isSystemCategory } from "@/lib/category";

/**
 * 更新分类覆盖（隐藏或自定义名称）
 * 仅适用于系统分类（全局分类），学校管理员可通过此接口隐藏或自定义显示名称
 */
export async function updateCategoryOverride(
  categoryId: string,
  input: { isHidden?: boolean; customName?: string | null }
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const isSchoolAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
    if (!isSchoolAdmin && auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅管理员可操作" };
    }

    if (isSchoolAdmin && !auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, schoolId: true, isGlobal: true },
    });

    if (!category) {
      return { success: false, error: "分类不存在" };
    }

    if (!isSystemCategory(category)) {
      return { success: false, error: "只能对系统分类设置覆盖（隐藏或自定义名称）" };
    }

    const schoolId = auth.schoolId!;
    if (input.isHidden === true) {
      await upsertCategoryOverride(schoolId, categoryId, true, null);
      return { success: true, message: "全局分类已在该学校隐藏" };
    }

    if (input.customName !== undefined) {
      if (input.customName && input.customName.trim().length > 50) {
        return { success: false, error: "自定义名称过长（最多 50 字）" };
      }
      await upsertCategoryOverride(schoolId, categoryId, false, input.customName?.trim() || null);
      return { success: true, message: input.customName ? "分类名称已自定义" : "已恢复为默认名称" };
    }

    return { success: false, error: "请提供 isHidden 或 customName 参数" };
  } catch (error) {
    console.error("更新分类覆盖失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 删除分类覆盖（恢复系统分类的默认显示）
 */
export async function removeCategoryOverrideAction(
  categoryId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const isSchoolAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
    if (!isSchoolAdmin && auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅管理员可操作" };
    }

    if (isSchoolAdmin && !auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, schoolId: true, isGlobal: true },
    });

    if (!category) {
      return { success: false, error: "分类不存在" };
    }

    if (!isSystemCategory(category)) {
      return { success: false, error: "只能恢复系统分类的覆盖" };
    }

    await removeCategoryOverride(auth.schoolId!, categoryId);
    return { success: true, message: "已恢复为默认显示" };
  } catch (error) {
    console.error("删除分类覆盖失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}