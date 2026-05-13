/**
 * 生存集市 Server Actions
 *
 * 本模块已拆分至 lib/market/ 目录，此文件仅作为向后兼容的转发层。
 * 新代码请直接从对应的功能模块导入，以获得更好的类型支持和可维护性。
 *
 * @deprecated 请使用 lib/market/index.ts 中的导出
 */

export * from "@/lib/market";

// lockMarketItem 已废弃，但保留导出以兼容现有调用方
// 新代码应使用 selectBuyerAndLock(itemId, buyerId)
export { lockMarketItem } from "@/lib/market/lock-wrapper";
