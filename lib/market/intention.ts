"use server";

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { deniedBySchoolTenant } from "@/lib/school/scope";
import { validateContent } from "@/lib/content/validator";
import { MarketItemStatus, NotificationType, NotificationEntityType } from "@prisma/client";
import { createMarketLog, createNotification } from "./shared";
import type { MarketActionResult, MarketIntentionWithUser } from "./types";
import { MarketLogActionType } from "./constants";
import { getUserReputationBatch } from "./reputation";

export { submitIntention, selectBuyerAndLock, getIntentions, withdrawIntention };

/** 提交意向 */
async function submitIntention(
  itemId: string,
  contactInfo?: string | null
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, schoolId: true, status: true, title: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId === auth.userId) {
      return { success: false, error: "不能对自己发布的商品提交意向" };
    }

    if (deniedBySchoolTenant(auth, item.schoolId)) {
      return { success: false, error: "无权操作该校商品" };
    }

    if (item.status !== MarketItemStatus.ACTIVE) {
      return { success: false, error: "该商品当前不可提交意向" };
    }

    const contact = contactInfo != null ? String(contactInfo).trim().slice(0, 200) : null;
    if (contact != null && contact.length > 0) {
      try {
        await validateContent(contact, { maskNumbers: false });
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "联系方式包含敏感词汇，请修改后重试。",
        };
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.marketIntention.create({
          data: {
            itemId: item.id,
            userId: auth.userId,
            contactInfo: contact || null,
          },
        });
        await createMarketLog(item.id, auth.userId, MarketLogActionType.INTENTION_CREATED, null, tx);
      });
      await createNotification(
        item.userId,
        auth.userId,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        `有人对您的商品「${(item.title || "").slice(0, 30)}${(item.title?.length ?? 0) > 30 ? "…" : ""}」提交了意向`
      );
    } catch (createErr: unknown) {
      if (
        createErr &&
        typeof createErr === "object" &&
        "code" in createErr &&
        (createErr as { code: string }).code === "P2002"
      ) {
        return { success: false, error: "您已对该商品提交过意向" };
      }
      throw createErr;
    }

    return { success: true };
  } catch (err) {
    console.error("[submitIntention]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "提交意向失败",
    };
  }
}

/** 卖家选定买家并锁定 */
async function selectBuyerAndLock(
  itemId: string,
  buyerId: string
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, schoolId: true, status: true, title: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId !== auth.userId) {
      return { success: false, error: "仅卖家可选定买家并锁定" };
    }

    if (item.status !== MarketItemStatus.ACTIVE) {
      return { success: false, error: "只有 ACTIVE 状态的商品可选定买家" };
    }

    const intention = await prisma.marketIntention.findUnique({
      where: {
        itemId_userId: { itemId: item.id, userId: buyerId.trim() },
      },
    });

    if (!intention) {
      return { success: false, error: "该用户未对该商品提交过意向" };
    }

    const buyer = await prisma.user.findUnique({
      where: { id: buyerId.trim() },
      select: { email: true },
    });
    const lockDetails = JSON.stringify({
      selectedBuyerId: buyerId.trim(),
      buyerEmail: buyer?.email ?? null,
    });

    const lockResult = await prisma.$transaction(async (tx) => {
      const result = await tx.marketItem.updateMany({
        where: { id: item.id, status: MarketItemStatus.ACTIVE },
        data: {
          selectedBuyerId: buyerId.trim(),
          status: MarketItemStatus.LOCKED,
          lockedAt: new Date(),
          buyerConfirmed: false,
          sellerConfirmed: false,
        },
      });
      if (result.count === 0) {
        return { locked: false as const };
      }
      await createMarketLog(
        item.id,
        auth.userId,
        MarketLogActionType.ITEM_LOCKED,
        lockDetails,
        tx
      );
      return { locked: true as const };
    });

    if (!lockResult.locked) {
      return { success: false, error: "商品已被其他操作锁定，请刷新后重试" };
    }

    await createNotification(
      buyerId.trim(),
      auth.userId,
      NotificationType.SYSTEM,
      item.id,
      NotificationEntityType.MARKET_ITEM,
      `卖家已选定您为买家，请前往中控台确认交易`
    );

    const titlePreview =
      (item.title || "").length > 30
        ? `${(item.title || "").slice(0, 30)}…`
        : item.title || "";
    const lockedMessage = `商品「${titlePreview}」已被卖家锁定给其他买家，不再可交易`;

    const otherIntentions = await prisma.marketIntention.findMany({
      where: {
        itemId: item.id,
        userId: { not: buyerId.trim() },
      },
      select: { userId: true },
    });
    for (const intention of otherIntentions) {
      await createNotification(
        intention.userId,
        null,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        lockedMessage
      );
    }

    return { success: true };
  } catch (err) {
    console.error("[selectBuyerAndLock]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/** 获取商品意向列表 */
async function getIntentions(
  itemId: string
): Promise<MarketActionResult<MarketIntentionWithUser[]>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, schoolId: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId !== auth.userId) {
      return { success: false, error: "仅卖家可查看意向列表" };
    }

    if (deniedBySchoolTenant(auth, item.schoolId)) {
      return { success: false, error: "无权操作该校商品" };
    }

    const intentions = await prisma.marketIntention.findMany({
      where: { itemId: item.id },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // 批量查询所有意向用户的声誉（解决 N+1 问题）
    const buyerIds = intentions.map((i) => i.userId);
    const reputationMap = await getUserReputationBatch(buyerIds, "buyer");

    return {
      success: true,
      data: intentions.map((intention) => ({
        id: intention.id,
        itemId: intention.itemId,
        userId: intention.userId,
        contactInfo: intention.contactInfo,
        createdAt: intention.createdAt.toISOString(),
        user: {
          id: intention.user.id,
          nickname: intention.user.nickname,
          avatar: intention.user.avatar ?? null,
        },
        reputation: reputationMap.get(intention.userId) ?? undefined,
      })),
    };
  } catch (err) {
    console.error("[getIntentions]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取意向列表失败",
    };
  }
}

/** 撤回意向 */
async function withdrawIntention(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, status: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    // 交易完成后不可撤回意向（COMPLETED 状态表示交易已成功结束）
    // 其他状态（ACTIVE、LOCKED、DELETED）都可以撤回意向
    if (item.status === MarketItemStatus.COMPLETED) {
      return { success: false, error: "交易已完成，无法撤回意向" };
    }

    const deleted = await prisma.marketIntention.deleteMany({
      where: {
        itemId: item.id,
        userId: auth.userId,
      },
    });

    if (deleted.count === 0) {
      return { success: false, error: "您未对该商品提交过意向" };
    }

    await createMarketLog(item.id, auth.userId, MarketLogActionType.INTENTION_WITHDRAWN, null);
    return { success: true };
  } catch (err) {
    console.error("[withdrawIntention]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "撤回失败",
    };
  }
}
