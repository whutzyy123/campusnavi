/**
 * 分类相关类型定义
 */

import { CATEGORY_GROUP_REGULAR, CATEGORY_GROUP_CONVENIENCE } from "@/types/category";

/** 筛选面板分类项 */
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

/** getSchoolCategoriesForAdmin 选项 */
export type GetSchoolCategoriesOptions =
  | { page: number; limit: number }
  | { all?: true; grouped?: true };

/** 全局分类列表项（常规 POI 分类，isGlobal=true, schoolId=null，排除便民公共设施） */
export interface GlobalCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 便民公共设施分类项（对应 DB isMicroCategory === true） */
export interface MicroCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 便民公共设施分类项（MicroCategoryItem 的语义化别名） */
export type ConvenienceCategoryItem = MicroCategoryItem;

/** 分类操作结果 */
export interface CategoryActionResult {
  success: boolean;
  data?: MicroCategoryItem | MicroCategoryItem[];
  message?: string;
  error?: string;
}

/** 分类更新结果 */
export interface CategoryUpdateResult {
  success: boolean;
  data?: { id: string; name: string; icon: string | null };
  message?: string;
  error?: string;
}

/** 系统分类项 */
export interface SystemCategoryItem {
  id: string;
  name: string;
  icon: string | null;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 本地分类项 */
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

/** 获取全量分类结果 */
export interface GetAllUniqueCategoriesResult {
  success: boolean;
  systemCategories?: SystemCategoryItem[];
  localCategories?: LocalCategoryItem[];
  schools?: { id: string; name: string }[];
  error?: string;
}