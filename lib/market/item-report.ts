"use server";

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { deniedBySchoolTenant } from "@/lib/school/scope";
import { createNotification } from "@/lib/actions/notification";
import { MarketItemStatus, NotificationType, NotificationEntityType } from "@prisma/client";
import type { MarketActionResult } from "./types";
import { REPORT_HIDE_THRESHOLD } from "./constants";

export { reportMarketItem };

/** 举报集市商品 */
async function reportMarketItem(
  itemId: string
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    if (!itemId?.trim()) {
      return { success: false, error: "itemId 为必填项" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, schoolId: true, userId: true, reportCount: true, title: true, status: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (deniedBySchoolTenant(auth, item.schoolId)) {
      return { success: false, error: "无权举报该商品" };
    }

    // 已下架的商品不允许重复举报
    if (item.status === MarketItemStatus.HIDDEN) {
      return { success: false, error: "该商品已下架，无需重复举报" };
    }

    const reportKey = `report:market-item:${item.id}:user:${auth.userId}`;

    // 原子化事务：先做"用户-商品"唯一举报去重，再进行举报数更新 + 下架判定 + 通知
    const result = await prisma.$transaction(async (tx) => {
      try {
        await tx.rateLimit.create({
          data: {
            key: reportKey,
            count: 1,
            windowStart: new Date(),
          },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          return {
            duplicated: true,
            newCount: item.reportCount,
            isHidden: item.status === MarketItemStatus.HIDDEN,
            userId: item.userId,
            itemId: item.id,
          };
        }
        throw error;
      }

      const updated = await tx.marketItem.update({
        where: { id: item.id },
        data: { reportCount: { increment: 1 } },
        select: { id: true, userId: true, reportCount: true, status: true },
      });

      const newCount = updated.reportCount;
      const shouldHide = newCount >= REPORT_HIDE_THRESHOLD;

      if (shouldHide && updated.status !== MarketItemStatus.HIDDEN) {
        await tx.marketItem.update({
          where: { id: item.id },
          data: { status: MarketItemStatus.HIDDEN },
        });
      }

      return {
        duplicated: false,
        newCount,
        isHidden: shouldHide,
        userId: updated.userId,
        itemId: updated.id,
      };
    });

    if (result.duplicated) {
      return { success: true };
    }

    // 通知卖家：仅在达到下架阈值时通知
    if (result.isHidden && result.userId) {
      await createNotification(
        result.userId,
        null,
        NotificationType.SYSTEM,
        result.itemId,
        NotificationEntityType.MARKET_ITEM,
        "您的生存集市商品因被举报次数过多已被自动下架，如有疑问请联系管理员。"
      );
    }

    return { success: true };
  } catch (err) {
    console.error("[reportMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "举报失败",
    };
  }
}
