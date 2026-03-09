/**
 * 分类相关常量与类型
 * 便民公共设施：对应数据库字段 isMicroCategory，用于饮水机、卫生间等公共设施分类
 */

/** API 返回的分组键：常规分类 */
export const CATEGORY_GROUP_REGULAR = "regular" as const;

/** API 返回的分组键：便民公共设施（对应 DB isMicroCategory） */
export const CATEGORY_GROUP_CONVENIENCE = "convenience" as const;

export type CategoryGroupKey =
  | typeof CATEGORY_GROUP_REGULAR
  | typeof CATEGORY_GROUP_CONVENIENCE;
