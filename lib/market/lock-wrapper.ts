"use server";

/**
 * @deprecated 此函数已废弃，仅保留用于向后兼容。请使用 selectBuyerAndLock(itemId, buyerId)
 * lockMarketItem 会在未来版本中移除。
 */
import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { MarketItemStatus } from "@prisma/client";
import type { MarketActionResult } from "./types";

export async function lockMarketItem(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, status: true, selectedBuyerId: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId !== auth.userId) {
      return { success: false, error: "仅卖家可锁定商品" };
    }

    if (item.status !== MarketItemStatus.ACTIVE) {
      return { success: false, error: "只有 ACTIVE 状态的商品可锁定" };
    }

    if (!item.selectedBuyerId) {
      return { success: false, error: "请先选定买家后再锁定（使用 selectBuyerAndLock）" };
    }

    await prisma.marketItem.update({
      where: { id: item.id },
      data: {
        status: MarketItemStatus.LOCKED,
        lockedAt: new Date(),
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[lockMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}
