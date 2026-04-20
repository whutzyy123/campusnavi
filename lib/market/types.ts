/** 按交易类型 ID 分组的物品分类（用户端） */
export type MarketCategoriesByType = Record<
  number,
  Array<{ id: string; name: string; order: number }>
>;

/** 集市分类与交易类型（用于发布表单等） */
export interface MarketCategoriesResult {
  data: MarketCategoriesByType;
  transactionTypes: Array<{ id: number; name: string; code: string; order: number }>;
}

export interface MarketActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
