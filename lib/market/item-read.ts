"use server";

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { deniedBySchoolTenant } from "@/lib/school/scope";
import { MarketItemStatus } from "@prisma/client";
import type {
  MarketActionResult,
  PublicMarketItemEntry,
  PublicMarketItemDetail,
} from "./types";
import { safeImages } from "./types";
import { processMarketDeadlocks } from "./deadlock";
import { getMarketThumbsUpRate, getMarketThumbsUpRateBatch, getUserReputation } from "./reputation";
import { REPORT_HIDE_THRESHOLD } from "./constants";

export { getPublicMarketItems, getMarketItemDetail };

/** 获取生存集市商品列表（公开） */
async function getPublicMarketItems(
  schoolId: string,
  options?: { typeId?: number; categoryId?: string; poiId?: string }
): Promise<MarketActionResult<PublicMarketItemEntry[]>> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "schoolId 为必填项" };
    }

    const now = new Date();
    const where: Record<string, unknown> = {
      schoolId: schoolId.trim(),
      status: MarketItemStatus.ACTIVE,
      expiresAt: { gt: now },
    };

    if (options?.typeId != null && options.typeId > 0) {
      where.typeId = options.typeId;
    }
    if (options?.categoryId?.trim()) {
      where.categoryId = options.categoryId.trim();
    }
    if (options?.poiId?.trim()) {
      where.poiId = options.poiId.trim();
    }

    const items = await prisma.marketItem.findMany({
      where,
      select: {
        id: true,
        poiId: true,
        categoryId: true,
        typeId: true,
        title: true,
        description: true,
        price: true,
        images: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        poi: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        transactionType: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        poiId: item.poiId,
        categoryId: item.categoryId,
        typeId: item.typeId,
        transactionType: item.transactionType,
        title: item.title,
        description: item.description,
        price: item.price,
        images: safeImages(item.images),
        status: item.status,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        poi: item.poi,
        category: item.category,
      })),
    };
  } catch (err) {
    console.error("[getPublicMarketItems]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取商品列表失败",
    };
  }
}

/** 获取单个集市商品详情 */
async function getMarketItemDetail(
  id: string
): Promise<MarketActionResult<PublicMarketItemDetail>> {
  try {
    if (!id?.trim()) {
      return { success: false, error: "id 为必填项" };
    }

    await processMarketDeadlocks();

    const auth = await getAuthCookie();
    const now = new Date();

    const item = await prisma.marketItem.findFirst({
      where: {
        id: id.trim(),
        ...(auth?.userId
          ? {
              OR: [
                { status: MarketItemStatus.ACTIVE, expiresAt: { gt: now } },
                {
                  userId: auth.userId,
                  status: {
                    in: [
                      MarketItemStatus.ACTIVE,
                      MarketItemStatus.LOCKED,
                      MarketItemStatus.COMPLETED,
                    ],
                  },
                },
                {
                  selectedBuyerId: auth.userId,
                  status: { in: [MarketItemStatus.LOCKED, MarketItemStatus.COMPLETED] },
                },
                {
                  intentions: { some: { userId: auth.userId } },
                  status: MarketItemStatus.ACTIVE,
                },
              ],
            }
          : {
              status: MarketItemStatus.ACTIVE,
              expiresAt: { gt: now },
            }),
      },
      select: {
        id: true,
        poiId: true,
        categoryId: true,
        typeId: true,
        title: true,
        description: true,
        contact: true,
        price: true,
        images: true,
        status: true,
        selectedBuyerId: true,
        buyerConfirmed: true,
        sellerConfirmed: true,
        lockedAt: true,
        buyerRatingOfSeller: true,
        sellerRatingOfBuyer: true,
        expiresAt: true,
        createdAt: true,
        userId: true,
        poi: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        user: { select: { id: true, nickname: true } },
        selectedBuyer: { select: { id: true, nickname: true } },
        transactionType: { select: { id: true, name: true, code: true } },
      },
    });

    if (!item) {
      return { success: false, error: "商品不存在或已下架" };
    }

    // 查询意向数
    const intentionsCount = await prisma.marketIntention.count({
      where: { itemId: id.trim() },
    });

    // 查询当前用户的意向
    let hasSubmittedIntention = false;
    if (auth?.userId) {
      const myIntention = await prisma.marketIntention.findUnique({
        where: { itemId_userId: { itemId: id.trim(), userId: auth.userId } },
        select: { id: true },
      });
      hasSubmittedIntention = !!myIntention;
    }

    // 判断联系方式可见性：卖家本人、已提交意向的买家、被选中的买家可见
    const isSeller = auth?.userId === item.userId;
    const isSelectedBuyer = !!auth?.userId && auth.userId === item.selectedBuyerId;
    const canViewContact = isSeller || isSelectedBuyer || hasSubmittedIntention;
    const masked = !canViewContact && !!item.contact;

    // 脱敏联系人
    let contact: string | null = null;
    if (!masked) {
      contact = item.contact;
    }

    // 补充买家评价和声誉（使用批量查询避免 N+1）
    let buyerThumbsUpRate: number | undefined;
    let sellerThumbsUpRate: number | undefined;
    let sellerReputation = undefined;

    const userIdsToQuery: string[] = [];
    if (item.selectedBuyerId) userIdsToQuery.push(item.selectedBuyerId);
    if (item.userId) userIdsToQuery.push(item.userId);

    if (userIdsToQuery.length > 0) {
      const thumbsUpResults = await getMarketThumbsUpRateBatch(userIdsToQuery);
      if (item.selectedBuyerId) {
        const buyerData = thumbsUpResults.get(item.selectedBuyerId);
        if (buyerData) buyerThumbsUpRate = buyerData.rate;
      }
      if (item.userId) {
        const sellerData = thumbsUpResults.get(item.userId);
        if (sellerData) sellerThumbsUpRate = sellerData.rate;
      }
    }

    if (item.userId) {
      const repResult = await getUserReputation(item.userId, "seller");
      if (repResult.success && repResult.data) {
        sellerReputation = repResult.data;
      }
    }

    return {
      success: true,
      data: {
        id: item.id,
        poiId: item.poiId,
        categoryId: item.categoryId,
        typeId: item.typeId,
        transactionType: item.transactionType,
        title: item.title,
        description: item.description,
        contact,
        price: item.price,
        images: safeImages(item.images),
        status: item.status,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        poi: item.poi,
        category: item.category,
        user: item.user,
        buyerId: item.selectedBuyerId,
        buyer: item.selectedBuyer,
        selectedBuyerId: item.selectedBuyerId,
        selectedBuyer: item.selectedBuyer,
        buyerConfirmed: item.buyerConfirmed,
        sellerConfirmed: item.sellerConfirmed,
        lockedAt: item.lockedAt?.toISOString() ?? null,
        hasSubmittedIntention,
        intentionsCount,
        buyerThumbsUpRate,
        sellerThumbsUpRate,
        sellerReputation,
        masked: masked ? true : undefined,
        message: masked ? "卖家联系方式仅在表达意向后可见" : undefined,
      },
    };
  } catch (err) {
    console.error("[getMarketItemDetail]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取商品详情失败",
    };
  }
}
