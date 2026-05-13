"use server";

/**
 * 集市死锁保护：自动解锁与单方自动完成
 */
import { prisma } from "@/lib/core/prisma";
import { createNotification } from "@/lib/actions/notification";
import {
  NotificationType,
  NotificationEntityType,
  MarketItemStatus,
} from "@prisma/client";
import {
  MarketLogActionType,
  AUTO_UNLOCK_HOURS,
  AUTO_COMPLETE_HOURS,
} from "./constants";
import { createMarketLog, getSystemUserId } from "./shared";

export async function processMarketDeadlocks(): Promise<void> {
  const systemUserId = await getSystemUserId();
  const now = new Date();
  const unlockThreshold = new Date(now.getTime() - AUTO_UNLOCK_HOURS * 60 * 60 * 1000);
  const completeThreshold = new Date(now.getTime() - AUTO_COMPLETE_HOURS * 60 * 60 * 1000);

  // 1. 自动解锁：lockedAt 超过 48h，且双方都未确认
  // 排除已下架（HIDDEN 状态）的商品，这些商品由管理员处理
  const toUnlock = await prisma.marketItem.findMany({
    where: {
      status: MarketItemStatus.LOCKED,
      lockedAt: { not: null, lt: unlockThreshold },
      buyerConfirmed: false,
      sellerConfirmed: false,
    },
    select: {
      id: true,
      userId: true,
      title: true,
    },
  });

  for (const item of toUnlock) {
    await prisma.$transaction(async (tx) => {
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

      // 重置所有意向为删除
      await tx.marketIntention.deleteMany({
        where: { itemId: item.id },
      });

      await createMarketLog(
        item.id,
        systemUserId ?? "system",
        MarketLogActionType.AUTO_UNLOCKED,
        "超过 48 小时未双方确认，自动解锁",
        tx
      );
    });

    if (systemUserId) {
      try {
        await createNotification(
          item.userId,
          systemUserId,
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          `您的商品「${(item.title || "").slice(0, 30)}」因超过 48 小时未完成交易，已自动解锁，其他同学可继续申请`
        );
      } catch (notifyErr) {
        console.error("[processMarketDeadlocks] AUTO_UNLOCKED 通知发送失败:", {
          itemId: item.id,
          receiverId: item.userId,
          error: notifyErr,
        });
      }
    }
  }

  // 2. 单方自动完成：一方已确认，另一方 24h 内未确认 → 自动 COMPLETED
  // 排除已下架（HIDDEN 状态）的商品
  const toComplete = await prisma.marketItem.findMany({
    where: {
      status: MarketItemStatus.LOCKED,
      lockedAt: { not: null, lt: completeThreshold },
      OR: [
        { buyerConfirmed: true, sellerConfirmed: false },
        { buyerConfirmed: false, sellerConfirmed: true },
      ],
    },
    select: {
      id: true,
      userId: true,
      selectedBuyerId: true,
      title: true,
      buyerConfirmed: true,
    },
  });

  for (const item of toComplete) {
    const unconfirmedPartyId = item.buyerConfirmed ? item.userId : item.selectedBuyerId;

    await prisma.$transaction(async (tx) => {
      await tx.marketItem.update({
        where: { id: item.id },
        data: { status: MarketItemStatus.COMPLETED },
      });

      await createMarketLog(
        item.id,
        systemUserId ?? "system",
        MarketLogActionType.AUTO_COMPLETED,
        "单方超时未确认，自动完成",
        tx
      );
    });

    if (unconfirmedPartyId) {
      const msg = item.buyerConfirmed
        ? `您对商品「${(item.title || "").slice(0, 30)}」的意向已超时，卖家已自动确认完成交易`
        : `您的商品「${(item.title || "").slice(0, 30)}」的买家超时未确认，系统已自动完成交易`;
      try {
        await createNotification(
          unconfirmedPartyId,
          systemUserId ?? "system",
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          msg
        );
      } catch (notifyErr) {
        console.error("[processMarketDeadlocks] AUTO_COMPLETED 通知发送失败:", {
          itemId: item.id,
          receiverId: unconfirmedPartyId,
          error: notifyErr,
        });
      }
    }
  }
}
