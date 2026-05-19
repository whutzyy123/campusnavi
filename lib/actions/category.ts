/**
 * 分类 Server Actions 兼容层
 * @deprecated 请直接从 `@/lib/actions/category/` 导入
 *
 * - 公开：getCategoriesForFilter（地图筛选面板）
 * - 便民公共设施（DB 字段 isMicroCategory）CRUD：仅超级管理员可管理
 * - POI 分类（System/Local）更新与删除：按角色区分权限
 *
 * 分类类型定义：
 * - System Category: schoolId === null && isGlobal === true
 * - Local Category: schoolId !== null
 *
 * 注意：此文件仅作为重导出层，不声明 "use server"。
 * 实际的 Server Actions 在 ./category/index.ts 子模块中声明。
 */

// 重导出所有 Server Actions（从子模块导入，避免循环）
export {
  // 列表读取
  getCategoriesForFilter,
  getSchoolCategoriesForAdmin,
  // 学校分类写入
  createSchoolCategory,
  // 全局分类管理
  getGlobalCategories,
  createGlobalCategory,
  deleteGlobalCategory,
  // 便民公共设施管理
  getMicroCategories,
  createMicroCategory,
  updateMicroCategory,
  deleteMicroCategory,
  // POI 分类更新/删除
  updateCategory,
  deleteCategory,
  // 分类覆盖
  updateCategoryOverride,
  removeCategoryOverrideAction,
  // 超管全量监控
  getAllUniqueCategories,
} from "./category/index";

// 辅助函数从 lib/category 导出（非 Server Action）
export { isSystemCategory, isLocalCategory } from "@/lib/category";

// 重导出类型
export type {
  FilterCategoryItem,
  CategoriesForFilterResult,
  GetSchoolCategoriesOptions,
  GlobalCategoryItem,
  MicroCategoryItem,
  ConvenienceCategoryItem,
  CategoryActionResult,
  CategoryUpdateResult,
  SystemCategoryItem,
  LocalCategoryItem,
  GetAllUniqueCategoriesResult,
} from "@/lib/category";