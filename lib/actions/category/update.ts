"use server";

/**
 * POI 分类更新/删除 Server Actions
 * - updateCategory：更新 POI 分类
 * - deleteCategory：删除 POI 分类
 */

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import { isSystemCategory, isLocalCategory } from "@/lib/category";
import type { CategoryUpdateResult } from "@/lib/category";

// ========== Server Actions ==========

/**
 * 更新 POI 分类（修改 base 名称/图标）
 * - 学校管理员：禁止修改系统分类名称；允许完整编辑本校的本地分类
 * - 超级管理员：允许完整编辑系统分类
 */
export async function updateCategory(
  id: string,
  input: { name?: string; icon?: string | null }
): Promise<CategoryUpdateResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const category = await prisma.category.findUnique({
      where: { id },
      select: { id: true, schoolId: true, isGlobal: true, isMicroCategory: true, name: true },
    });

    if (!category) {
      return { success: false, error: "分类不存在" };
    }

    // 便民公共设施使用 updateMicroCategory
    if (category.isMicroCategory) {
      return { success: false, error: "请使用便民公共设施的更新接口" };
    }

    if (isSystemCategory(category)) {
      // 系统分类：仅超级管理员可修改名称/图标
      if (auth.role !== "SUPER_ADMIN") {
        return { success: false, error: "学校管理员无法修改系统分类名称" };
      }
    } else if (isLocalCategory(category)) {
      // 本地分类：仅本校管理员或超级管理员可修改
      const isSchoolAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
      if (isSchoolAdmin && auth.schoolId !== category.schoolId) {
        return { success: false, error: "无权修改其他学校的分类" };
      }
      if (!isSchoolAdmin && auth.role !== "SUPER_ADMIN") {
        return { success: false, error: "仅管理员可修改分类" };
      }
    }

    const trimmedName = input.name?.trim();
    if (trimmedName !== undefined) {
      if (!trimmedName) {
        return { success: false, error: "分类名称不能为空" };
      }
      if (trimmedName.length > 50) {
        return { success: false, error: "分类名称过长（最多 50 字）" };
      }
      const existing = category.schoolId
        ? await prisma.category.findUnique({
            where: { schoolId_name: { schoolId: category.schoolId, name: trimmedName } },
          })
        : await prisma.category.findFirst({
            where: { schoolId: null, isGlobal: true, name: trimmedName, id: { not: id } },
          });
      if (existing) {
        return { success: false, error: "该分类名称已存在" };
      }
    }

    const updateData: { name?: string; icon?: string | null } = {};
    if (trimmedName !== undefined) updateData.name = trimmedName;
    if (input.icon !== undefined) updateData.icon = input.icon?.trim() || null;

    const updated = await prisma.category.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, icon: true },
    });

    return {
      success: true,
      message: "分类已更新",
      data: { id: updated.id, name: updated.name, icon: updated.icon },
    };
  } catch (error) {
    console.error("更新分类失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 删除 POI 分类（物理删除）
 * - 学校管理员：禁止删除系统分类；允许删除本校的本地分类（无 POI 关联时）
 * - 超级管理员：允许删除系统分类
 */
export async function deleteCategory(id: string): Promise<CategoryUpdateResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const category = await prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        isGlobal: true,
        isMicroCategory: true,
        _count: { select: { pois: true } },
      },
    });

    if (!category) {
      return { success: false, error: "分类不存在" };
    }

    // 便民公共设施使用 deleteMicroCategory
    if (category.isMicroCategory) {
      return { success: false, error: "请使用便民公共设施的删除接口" };
    }

    if (category._count.pois > 0) {
      return {
        success: false,
        error: `无法删除：该分类下仍有 ${category._count.pois} 个 POI，请先修改或删除这些 POI 后再删除分类`,
      };
    }

    if (isSystemCategory(category)) {
      // 系统分类：仅超级管理员可物理删除
      if (auth.role !== "SUPER_ADMIN") {
        return { success: false, error: "学校管理员无法删除系统分类" };
      }
    } else if (isLocalCategory(category)) {
      // 本地分类：仅本校管理员或超级管理员可删除
      const isSchoolAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
      if (isSchoolAdmin && auth.schoolId !== category.schoolId) {
        return { success: false, error: "无权删除其他学校的分类" };
      }
      if (!isSchoolAdmin && auth.role !== "SUPER_ADMIN") {
        return { success: false, error: "仅管理员可删除分类" };
      }
    }

    await prisma.category.delete({ where: { id } });
    return { success: true, message: "分类已删除" };
  } catch (error) {
    console.error("删除分类失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}