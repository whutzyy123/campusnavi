/**
 * 生存集市 Server Actions
 *
 * 本模块已拆分至 lib/market/ 目录，此文件作为统一的导出入口。
 * 所有导出均转发自对应功能模块。
 */

// 分类读取
export {
  getMarketCategoriesByType,
  getMarketCategories,
  getTransactionTypes,
} from "./catalog-read";

// 公开读取
export { getPublicMarketItems, getMarketItemDetail } from "./item-read";

// 我的商品
export { getMyMarketItems, createMarketItem, updateMarketItem, deleteMarketItem } from "./item-mine";

// 举报
export { reportMarketItem } from "./item-report";

// 意向
export { submitIntention, selectBuyerAndLock, getIntentions, withdrawIntention } from "./intention";

// 交易
export { unlockMarketItem, confirmTransaction, rateMarketTransaction } from "./transaction";

// 声誉
export { getUserReputation, getMarketThumbsUpRate } from "./reputation";

// 类型管理
export { createTransactionType, updateTransactionType, deleteTransactionType } from "./type-admin";

// 分类管理
export {
  createMarketCategory,
  updateMarketCategory,
  deleteMarketCategory,
  toggleTypeCategory,
} from "./category-admin";

// 死锁处理
export { processMarketDeadlocks } from "./deadlock";

// 管理员功能
export {
  generateMarketAuditReport,
  getAdminItemAuditTrail,
  adminMarketItemAction,
  getAdminMarketItems,
  getAdminMarketCategoriesConfig,
} from "./item-admin";

// 类型导出
export type {
  MarketActionResult,
  MarketCategoriesByType,
  MarketCategoriesResult,
  UserReputation,
  PublicMarketItemEntry,
  PublicMarketItemDetail,
  MarketItemResult,
  MyMarketItemEntry,
  MyMarketItemsResult,
  MarketIntentionWithUser,
  AdminItemAuditTrailResult,
  AdminMarketItemRow,
  AdminMarketCategoriesConfig,
  CreateMarketItemDTO,
  UpdateMarketItemPayload,
} from "./types";
export { UpdateMarketItemPayloadSchema } from "./types";
