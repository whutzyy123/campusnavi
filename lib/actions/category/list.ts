"use server";

/**
 * 分类列表读取 Server Actions
 * - getCategoriesForFilter：地图筛选面板分类
 * - getSchoolCategoriesForAdmin：管理员分类列表（分页/分组）
 */

import { prisma } from "@/lib/core/prisma";
import { getMergedCategories, type MergedCategory } from "@/lib/content/category-utils";
import { CATEGORY_GROUP_REGULAR, CATEGORY_GROUP_CONVENIENCE } from "@/types/category";
import type {
  FilterCategoryItem,
  CategoriesForFilterResult,
  GetSchoolCategoriesOptions,
} from "@/lib/category";

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