/**
 * 分类 Server Actions 统一导出
 */

// 列表读取
export { getCategoriesForFilter, getSchoolCategoriesForAdmin } from "./list";

// 学校分类写入
export { createSchoolCategory } from "./write";

// 全局分类管理
export { getGlobalCategories, createGlobalCategory, deleteGlobalCategory } from "./global";

// 便民公共设施管理
export { getMicroCategories, createMicroCategory, updateMicroCategory, deleteMicroCategory } from "./micro";

// POI 分类更新/删除
export { updateCategory, deleteCategory } from "./update";

// 分类覆盖
export { updateCategoryOverride, removeCategoryOverrideAction } from "./override";

// 超管全量监控
export { getAllUniqueCategories } from "./admin";