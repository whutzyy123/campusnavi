"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { MarketItemStatus, NotificationType, NotificationEntityType, Prisma } from "@prisma/client";
import { createMarketLog, createNotification } from "./shared";
import type { MarketActionResult } from "./types";
import { MarketLogActionType } from "./constants";

export { unlockMarketItem, confirmTransaction, rateMarketTransaction };

/** 解锁商品 */
async function unlockMarketItem(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: {
        id: true,
        userId: true,
        selectedBuyerId: true,
        status: true,
        title: true,
      },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId !== auth.userId) {
      return { success: false, error: "仅卖家可解锁商品" };
    }

    if (item.status !== MarketItemStatus.LOCKED) {
      return { success: false, error: "只有 LOCKED 状态的商品可解锁" };
    }

    const formerBuyerId = item.selectedBuyerId;
    let buyerEmail: string | null = null;
    if (formerBuyerId) {
      const buyer = await prisma.user.findUnique({
        where: { id: formerBuyerId },
        select: { email: true },
      });
      buyerEmail = buyer?.email ?? null;
    }

    let currentBuyerId: string | null = null;

    await prisma.$transaction(async (tx) => {
      // Step 1: 重新查询商品当前状态，确保使用最新的 selectedBuyerId
      const currentItem = await tx.marketItem.findUnique({
        where: { id: item.id },
        select: { selectedBuyerId: true },
      });

      currentBuyerId = currentItem?.selectedBuyerId ?? null;

      // Step 2: 重置商品状态
      await tx.marketItem.update({
        where: { id: item.id },
        data: {
          status: MarketItemStatus.ACTIVE,
          selectedBuyerId: null,
          buyerConfirmed: false,
          sellerConfirmed: false,
          lockedAt: null,
        },
      });

      // Step 3: 删除当前被锁定买家的意向（强制重新表达）
      // 使用当前查询到的 selectedBuyerId，而非事务外捕获的旧值，防止并发问题
      if (currentBuyerId) {
        await tx.marketIntention.deleteMany({
          where: { itemId: item.id, userId: currentBuyerId },
        });
      }

      // Step 4: 意向重置日志
      await createMarketLog(
        item.id,
        auth.userId,
        MarketLogActionType.INTENTION_RESET_BY_UNLOCK,
        null,
        tx
      );

      // Step 5: 记录解锁审计日志
      await createMarketLog(item.id, auth.userId, MarketLogActionType.ITEM_UNLOCKED, null, tx);

      // Step 6: 记录意向自动撤回审计日志
      if (currentBuyerId) {
        const resetDetails = JSON.stringify({ buyerEmail: buyerEmail ?? undefined });
        await createMarketLog(
          item.id,
          auth.userId,
          MarketLogActionType.INTENTION_AUTO_WITHDRAWN_ON_UNLOCK,
          resetDetails,
          tx
        );
      }
    });

    // Step 7: 通知买家（使用事务内查询到的 currentBuyerId）
    if (currentBuyerId) {
      await createNotification(
        currentBuyerId,
        auth.userId,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        "交易锁定已取消，您的意向已重置。若仍有需求可重新发布意向。"
      );
    }

    return { success: true };
  } catch (err) {
    console.error("[unlockMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/** 确认交易 */
async function confirmTransaction(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: {
        id: true,
        userId: true,
        selectedBuyerId: true,
        buyerConfirmed: true,
        sellerConfirmed: true,
        status: true,
      },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.status !== MarketItemStatus.LOCKED) {
      return { success: false, error: "只有 LOCKED 状态的商品可确认交易" };
    }

    const isSeller = item.userId === auth.userId;
    const isBuyer = item.selectedBuyerId === auth.userId;

    if (!isSeller && !isBuyer) {
      return { success: false, error: "仅买卖双方可确认交易" };
    }

    const txResult = await prisma.$transaction(
      async (tx) => {
        const latest = await tx.marketItem.findUnique({
          where: { id: item.id },
          select: {
            id: true,
            status: true,
            buyerConfirmed: true,
            sellerConfirmed: true,
            selectedBuyerId: true,
            userId: true,
          },
        });

        if (!latest) {
          throw new Error("商品不存在");
        }
        if (latest.status === MarketItemStatus.COMPLETED) {
          return { completed: true, shouldNotify: false };
        }
        if (latest.status !== MarketItemStatus.LOCKED) {
          throw new Error("只有 LOCKED 状态的商品可确认交易");
        }

        // 事务内重新验证买卖双方身份，防止并发场景下 selectedBuyerId 被其他操作修改
        const currentIsSeller = latest.userId === auth.userId;
        const currentIsBuyer = latest.selectedBuyerId === auth.userId;

        if (!currentIsSeller && !currentIsBuyer) {
          throw new Error("当前用户不是该交易的买卖双方，无法确认");
        }

        const updates: {
          buyerConfirmed?: boolean;
          sellerConfirmed?: boolean;
          status?: MarketItemStatus;
          firstConfirmedAt?: Date;
        } = {};

        const sellerAlreadyConfirmed = latest.sellerConfirmed;
        const buyerAlreadyConfirmed = latest.buyerConfirmed;
        const shouldWriteSellerConfirm = currentIsSeller && !sellerAlreadyConfirmed;
        const shouldWriteBuyerConfirm = currentIsBuyer && !buyerAlreadyConfirmed;

        if (shouldWriteSellerConfirm) {
          updates.sellerConfirmed = true;
        }
        if (shouldWriteBuyerConfirm) {
          updates.buyerConfirmed = true;
        }
        if (!sellerAlreadyConfirmed && !buyerAlreadyConfirmed) {
          updates.firstConfirmedAt = new Date();
        }

        const nextSellerConfirmed = shouldWriteSellerConfirm || sellerAlreadyConfirmed;
        const nextBuyerConfirmed = shouldWriteBuyerConfirm || buyerAlreadyConfirmed;
        const completed = nextSellerConfirmed && nextBuyerConfirmed;
        if (completed) {
          updates.status = MarketItemStatus.COMPLETED;
        }

        if (Object.keys(updates).length > 0) {
          await tx.marketItem.update({
            where: { id: item.id },
            data: updates,
          });
        }
        if (shouldWriteSellerConfirm) {
          await createMarketLog(item.id, auth.userId, MarketLogActionType.SELLER_CONFIRMED, null, tx);
        }
        if (shouldWriteBuyerConfirm) {
          await createMarketLog(item.id, auth.userId, MarketLogActionType.BUYER_CONFIRMED, null, tx);
        }
        if (completed) {
          await createMarketLog(
            item.id,
            auth.userId,
            MarketLogActionType.TRANSACTION_COMPLETED,
            null,
            tx
          );
        }

        return {
          completed,
          shouldNotify: shouldWriteSellerConfirm || shouldWriteBuyerConfirm,
          currentIsSeller,
          currentIsBuyer,
          otherUserId: currentIsSeller ? latest.selectedBuyerId : latest.userId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );

    if (txResult.otherUserId && txResult.shouldNotify) {
      await createNotification(
        txResult.otherUserId,
        auth.userId,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        txResult.currentIsSeller ? "卖家已确认交易完成" : "买家已确认交易完成"
      );
    }

    revalidatePath("/center/market");

    return { success: true, data: { completed: txResult.completed } };
  } catch (err) {
    console.error("[confirmTransaction]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/** 评价交易 */
async function rateMarketTransaction(
  itemId: string,
  isPositive: boolean
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: {
        id: true,
        userId: true,
        selectedBuyerId: true,
        status: true,
      },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.status !== MarketItemStatus.COMPLETED) {
      return { success: false, error: "只能对已完成的交易进行评价" };
    }

    const isSeller = item.userId === auth.userId;
    const isBuyer = item.selectedBuyerId === auth.userId;

    if (!isSeller && !isBuyer) {
      return { success: false, error: "仅买卖双方可评价" };
    }

    const updatedCount = isSeller
      ? (
          await prisma.marketItem.updateMany({
            where: { id: item.id, buyerRatingOfSeller: null },
            data: { buyerRatingOfSeller: isPositive },
          })
        ).count
      : (
          await prisma.marketItem.updateMany({
            where: { id: item.id, sellerRatingOfBuyer: null },
            data: { sellerRatingOfBuyer: isPositive },
          })
        ).count;

    if (updatedCount === 0) {
      return { success: false, error: "您已评价过，无法重复评价" };
    }

    return { success: true };
  } catch (err) {
    console.error("[rateMarketTransaction]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "评价失败",
    };
  }
}
