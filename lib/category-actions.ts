"use server";

/**
 * 分类 Server Actions
 * - 公开：getCategoriesForFilter（地图筛选面板）
 * - 便民公共设施（DB 字段 isMicroCategory）CRUD：仅超级管理员可管理
 * - POI 分类（System/Local）更新与删除：按角色区分权限
 *
 * 分类类型定义：
 * - System Category: schoolId === null && isGlobal === true
 * - Local Category: schoolId !== null
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { getPaginationMeta } from "@/lib/utils";
import { getMergedCategories, upsertCategoryOverride, removeCategoryOverride, type MergedCategory } from "@/lib/category-utils";
import { CATEGORY_GROUP_REGULAR, CATEGORY_GROUP_CONVENIENCE } from "@/types/category";

/** 筛选面板分类项（id、name、icon） */
export interface FilterCategoryItem {
  id: string;
  name: string;
  icon: string | null;
}

/** 筛选面板返回结构 */
export interface CategoriesForFilterResult {
  [CATEGORY_GROUP_REGULAR]: FilterCategoryItem[];
  [CATEGORY_GROUP_CONVENIENCE]: FilterCategoryItem[];
}

/**
 * 获取指定学校的分类列表（公开，用于地图筛选面板）
 * 返回常规分类 + 便民公共设施分组
 */
export async function getCategoriesForFilter(schoolId: string): Promise<{
  success: boolean;
  data?: CategoriesForFilterResult;
  error?: string;
}> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "缺少 schoolId 参数" };
    }

    const mergedCategories = await getMergedCategories(schoolId.trim());
    const regular = mergedCategories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
    }));

    const convenienceCategories = await prisma.category.findMany({
      where: { isMicroCategory: true, schoolId: null },
      select: { id: true, name: true, icon: true },
      orderBy: { createdAt: "asc" },
    });
    const convenience = convenienceCategories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
    }));

    return {
      success: true,
      data: {
        [CATEGORY_GROUP_REGULAR]: regular,
        [CATEGORY_GROUP_CONVENIENCE]: convenience,
      },
    };
  } catch (err) {
    console.error("getCategoriesForFilter 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取分类列表失败",
    };
  }
}

/** getSchoolCategoriesForAdmin 选项 */
export type GetSchoolCategoriesOptions =
  | { page: number; limit: number }
  | { all?: true; grouped?: true };

/**
 * 获取学校分类（管理员用，支持分页或分组）
 * - { page, limit }: 分页列表，用于管理表格
 * - { all: true, grouped: true }: 分组格式 { regular, convenience }，用于 POI 表单
 */
export async function getSchoolCategoriesForAdmin(
  schoolId: string,
  options: GetSchoolCategoriesOptions
): Promise<{
  success: boolean;
  data?: MergedCategory[] | CategoriesForFilterResult;
  pagination?: { total: number; pageCount: number; currentPage: number };
  error?: string;
}> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "缺少 schoolId" };
    }

    const merged = await getMergedCategories(schoolId.trim());

    if ("all" in options && options.all && "grouped" in options && options.grouped) {
      const regular = merged.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
      const convenience = await prisma.category.findMany({
        where: { isMicroCategory: true, schoolId: null },
        select: { id: true, name: true, icon: true },
        orderBy: { createdAt: "asc" },
      });
      return {
        success: true,
        data: {
          [CATEGORY_GROUP_REGULAR]: regular,
          [CATEGORY_GROUP_CONVENIENCE]: convenience.map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
          })),
        },
      };
    }

    if ("page" in options && "limit" in options) {
      const { page, limit } = options;
      const total = merged.length;
      const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
      const take = Math.max(1, limit);
      const paginated = merged.slice(skip, skip + take);
      const pageCount = Math.ceil(total / take);
      return {
        success: true,
        data: paginated,
        pagination: { total, pageCount, currentPage: page },
      };
    }

    return { success: true, data: merged };
  } catch (err) {
    console.error("getSchoolCategoriesForAdmin 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取分类列表失败",
    };
  }
}

/** 创建学校分类（校内私有分类，非全局） */
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

/** 全局分类列表项（常规 POI 分类，isGlobal=true, schoolId=null，排除便民公共设施） */
export interface GlobalCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

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

/** 便民公共设施分类项（对应 DB isMicroCategory === true，字段未更名避免迁移） */
export interface MicroCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 便民公共设施分类项（MicroCategoryItem 的语义化别名，供新代码使用） */
export type ConvenienceCategoryItem = MicroCategoryItem;

export interface CategoryActionResult {
  success: boolean;
  data?: MicroCategoryItem | MicroCategoryItem[];
  message?: string;
  error?: string;
}

/**
 * 获取所有便民公共设施分类
 * 条件：isMicroCategory === true 且 schoolId === null（DB 字段未更名，避免迁移）
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
 * 创建便民公共设施分类
 * 权限：仅 SUPER_ADMIN
 * 多租户：schoolId 强制为 null，忽略客户端传入
 * DB 字段：isMicroCategory
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

    // 创建时强制 schoolId 为 null，忽略客户端传入
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

// ========== POI 分类（System / Local）权限逻辑 ==========

function isSystemCategory(category: { schoolId: string | null; isGlobal: boolean }): boolean {
  return category.schoolId === null && category.isGlobal === true;
}

function isLocalCategory(category: { schoolId: string | null }): boolean {
  return category.schoolId !== null;
}

export interface CategoryUpdateResult {
  success: boolean;
  data?: { id: string; name: string; icon: string | null };
  message?: string;
  error?: string;
}

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

// ========== Super Admin 全量分类监控 ==========

export interface SystemCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  schoolId: string;
  schoolName: string;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetAllUniqueCategoriesResult {
  success: boolean;
  systemCategories?: SystemCategoryItem[];
  localCategories?: LocalCategoryItem[];
  schools?: { id: string; name: string }[];
  error?: string;
}

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
