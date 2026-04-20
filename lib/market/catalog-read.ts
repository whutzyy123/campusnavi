"use server";

import { prisma } from "@/lib/prisma";
import type { MarketActionResult, MarketCategoriesByType, MarketCategoriesResult } from "./types";

/**
 * 获取按交易类型分组的物品分类（用户端发布商品时使用）
 * 返回 Map: transactionTypeId -> categories[]
 */
export async function getMarketCategoriesByType(): Promise<
  MarketActionResult<MarketCategoriesByType>
> {
  try {
    const links = await prisma.marketTypeCategory.findMany({
      where: {
        category: { isActive: true },
        transactionType: { isActive: true },
      },
      include: {
        category: { select: { id: true, name: true, order: true } },
      },
    });

    const grouped: MarketCategoriesByType = {};

    for (const link of links) {
      const tid = link.transactionTypeId;
      if (!grouped[tid]) grouped[tid] = [];
      grouped[tid].push({
        id: link.category.id,
        name: link.category.name,
        order: link.category.order,
      });
    }

    for (const tid of Object.keys(grouped)) {
      grouped[Number(tid)].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name)
      );
    }

    return { success: true, data: grouped };
  } catch (err) {
    console.error("[getMarketCategoriesByType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取分类失败",
    };
  }
}

/** 获取所有启用的交易类型 */
export async function getTransactionTypes() {
  try {
    const types = await prisma.marketTransactionType.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, name: true, code: true, order: true },
    });
    return { success: true, data: types };
  } catch (err) {
    console.error("[getTransactionTypes]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取交易类型失败",
    };
  }
}

/**
 * 获取集市分类与交易类型（一次性返回，替代 /api/market/categories）
 */
export async function getMarketCategories(): Promise<
  MarketActionResult<MarketCategoriesResult>
> {
  try {
    const [catResult, typeResult] = await Promise.all([
      getMarketCategoriesByType(),
      getTransactionTypes(),
    ]);
    if (!catResult.success || !typeResult.success) {
      return {
        success: false,
        error: catResult.error ?? typeResult.error ?? "获取失败",
      };
    }
    return {
      success: true,
      data: {
        data: catResult.data ?? ({} as MarketCategoriesByType),
        transactionTypes: typeResult.data ?? [],
      },
    };
  } catch (err) {
    console.error("[getMarketCategories]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取分类失败",
    };
  }
}
