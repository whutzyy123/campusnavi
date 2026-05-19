/**
 * 分类模块统一导出
 */

export * from "./types";

// ========== 辅助函数 ==========

/** 判断是否为系统分类（schoolId === null && isGlobal === true） */
export function isSystemCategory(category: { schoolId: string | null; isGlobal: boolean }): boolean {
  return category.schoolId === null && category.isGlobal === true;
}

/** 判断是否为本地分类（schoolId !== null） */
export function isLocalCategory(category: { schoolId: string | null }): boolean {
  return category.schoolId !== null;
}