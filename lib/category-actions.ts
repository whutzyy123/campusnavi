"use server";

/**
 * 分类 Server Actions
 * - 微观分类（Micro Category）CRUD：仅超级管理员可管理
 * - POI 分类（System/Local）更新与删除：按角色区分权限
 *
 * 分类类型定义：
 * - System Category: schoolId === null && isGlobal === true
 * - Local Category: schoolId !== null
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { upsertCategoryOverride, removeCategoryOverride } from "@/lib/category-utils";

export interface MicroCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryActionResult {
  success: boolean;
  data?: MicroCategoryItem | MicroCategoryItem[];
  message?: string;
  error?: string;
}

/**
 * 获取所有微观分类
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
    console.error("获取微观分类失败:", error);
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
    return { ok: false, error: "仅超级管理员可管理微观分类" };
  }

  return { ok: true };
}

/**
 * 创建微观分类
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

    // 检查是否已存在同名微观分类
    const existing = await prisma.category.findFirst({
      where: {
        isMicroCategory: true,
        schoolId: null,
        name: trimmedName,
      },
    });

    if (existing) {
      return { success: false, message: "该微观分类名称已存在" };
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
      message: "微观分类创建成功",
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
    console.error("创建微观分类失败:", error);
    return {
      success: false,
      message: "创建失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 更新微观分类
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
      return { success: false, message: "只能更新微观分类" };
    }

    const trimmedName = input.name?.trim();
    if (trimmedName !== undefined) {
      if (!trimmedName) {
        return { success: false, message: "分类名称不能为空" };
      }
      if (trimmedName.length > 50) {
        return { success: false, message: "分类名称过长（最多 50 字）" };
      }
      // 若改名，检查是否与其它微观分类重名
      const duplicate = await prisma.category.findFirst({
        where: {
          isMicroCategory: true,
          schoolId: null,
          name: trimmedName,
          id: { not: id },
        },
      });
      if (duplicate) {
        return { success: false, message: "该微观分类名称已存在" };
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
      message: "微观分类更新成功",
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
    console.error("更新微观分类失败:", error);
    return {
      success: false,
      message: "更新失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 删除微观分类
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
      return { success: false, message: "只能删除微观分类" };
    }

    await prisma.category.delete({
      where: { id },
    });

    return { success: true, message: "微观分类已删除" };
  } catch (error) {
    console.error("删除微观分类失败:", error);
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

    // 微观分类使用 updateMicroCategory
    if (category.isMicroCategory) {
      return { success: false, error: "请使用微观分类的更新接口" };
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

    // 微观分类使用 deleteMicroCategory
    if (category.isMicroCategory) {
      return { success: false, error: "请使用微观分类的删除接口" };
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

    // 1. 系统分类（isGlobal + schoolId null，排除微观分类）
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

    // 2. 校内分类（schoolId !== null，排除微观分类）
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
