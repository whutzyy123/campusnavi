"use server";

import { prisma } from "@/lib/core/prisma";
import { MarketItemStatus } from "@prisma/client";
import type { MarketActionResult, UserReputation } from "./types";

export { getUserReputation, getMarketThumbsUpRate, getUserReputationBatch, getMarketThumbsUpRateBatch };

/** 用户集市声誉 */
async function getUserReputation(
  targetUserId: string,
  mode: "seller" | "buyer"
): Promise<MarketActionResult<UserReputation>> {
  try {
    if (!targetUserId?.trim()) {
      return { success: false, error: "用户 ID 不能为空" };
    }

    const uid = targetUserId.trim();

    const [totalEvaluations, goodRatings] =
      mode === "seller"
        ? await Promise.all([
            prisma.marketItem.count({
              where: {
                userId: uid,
                status: MarketItemStatus.COMPLETED,
                buyerRatingOfSeller: { not: null },
              },
            }),
            prisma.marketItem.count({
              where: {
                userId: uid,
                status: MarketItemStatus.COMPLETED,
                buyerRatingOfSeller: true,
              },
            }),
          ])
        : await Promise.all([
            prisma.marketItem.count({
              where: {
                selectedBuyerId: uid,
                status: MarketItemStatus.COMPLETED,
                sellerRatingOfBuyer: { not: null },
              },
            }),
            prisma.marketItem.count({
              where: {
                selectedBuyerId: uid,
                status: MarketItemStatus.COMPLETED,
                sellerRatingOfBuyer: true,
              },
            }),
          ]);

    const approvalRate =
      totalEvaluations > 0 ? Math.round((goodRatings / totalEvaluations) * 100) : null;

    return {
      success: true,
      data: { totalEvaluations, goodRatings, approvalRate },
    };
  } catch (err) {
    console.error("[getUserReputation]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取声誉失败",
    };
  }
}

/** 获取用户在集市交易中的好评率 */
async function getMarketThumbsUpRate(
  userId: string
): Promise<{ success: boolean; data?: { thumbsUp: number; total: number; rate: number }; error?: string }> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "用户 ID 不能为空" };
    }

    const [asSeller, asBuyer] = await Promise.all([
      prisma.marketItem.findMany({
        where: {
          userId: userId.trim(),
          status: MarketItemStatus.COMPLETED,
          buyerRatingOfSeller: { not: null },
        },
        select: { buyerRatingOfSeller: true },
      }),
      prisma.marketItem.findMany({
        where: {
          selectedBuyerId: userId.trim(),
          status: MarketItemStatus.COMPLETED,
          sellerRatingOfBuyer: { not: null },
        },
        select: { sellerRatingOfBuyer: true },
      }),
    ]);

    const sellerGood = asSeller.filter((i) => i.buyerRatingOfSeller === true).length;
    const buyerGood = asBuyer.filter((i) => i.sellerRatingOfBuyer === true).length;
    const thumbsUp = sellerGood + buyerGood;
    const total = asSeller.length + asBuyer.length;
    const rate = total > 0 ? Math.round((thumbsUp / total) * 100) : 0;

    return { success: true, data: { thumbsUp, total, rate } };
  } catch (err) {
    console.error("[getMarketThumbsUpRate]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取好评率失败",
    };
  }
}

/**
 * 批量获取用户声誉（替代循环调用 getUserReputation，解决 N+1 查询）
 * @param userIds 用户 ID 数组
 * @param mode "seller" | "buyer"
 * @returns Map<userId, UserReputation>
 */
async function getUserReputationBatch(
  userIds: string[],
  mode: "seller" | "buyer"
): Promise<Map<string, import("./types").UserReputation>> {
  if (userIds.length === 0) return new Map();

  const uniqueIds = [...new Set(userIds)];

  const whereClause =
    mode === "seller"
      ? { userId: { in: uniqueIds }, status: MarketItemStatus.COMPLETED, buyerRatingOfSeller: { not: null } }
      : { selectedBuyerId: { in: uniqueIds }, status: MarketItemStatus.COMPLETED, sellerRatingOfBuyer: { not: null } };

  const items = await prisma.marketItem.findMany({
    where: whereClause,
    select: {
      userId: true,
      selectedBuyerId: true,
      buyerRatingOfSeller: true,
      sellerRatingOfBuyer: true,
    },
  });

  // 按用户 ID 聚合统计
  const stats = new Map<string, { total: number; good: number }>();
  for (const item of items) {
    const uid = mode === "seller" ? item.userId : item.selectedBuyerId!;
    if (!uid) continue;
    const existing = stats.get(uid) ?? { total: 0, good: 0 };
    existing.total += 1;
    const isGood = mode === "seller" ? item.buyerRatingOfSeller === true : item.sellerRatingOfBuyer === true;
    if (isGood) {
      existing.good += 1;
    }
    stats.set(uid, existing);
  }

  const result = new Map<string, import("./types").UserReputation>();
  for (const uid of uniqueIds) {
    const s = stats.get(uid);
    result.set(uid, {
      totalEvaluations: s?.total ?? 0,
      goodRatings: s?.good ?? 0,
      approvalRate: s && s.total > 0 ? Math.round((s.good / s.total) * 100) : null,
    });
  }
  return result;
}

/**
 * 批量获取用户好评率（解决 N+1 查询，用于商品详情页）
 * @param userIds 用户 ID 数组
 * @returns Map<userId, { thumbsUp, total, rate }>
 */
async function getMarketThumbsUpRateBatch(
  userIds: string[]
): Promise<Map<string, { thumbsUp: number; total: number; rate: number }>> {
  if (userIds.length === 0) return new Map();

  const uniqueIds = [...new Set(userIds)];

  const [asSeller, asBuyer] = await Promise.all([
    prisma.marketItem.findMany({
      where: {
        userId: { in: uniqueIds },
        status: MarketItemStatus.COMPLETED,
        buyerRatingOfSeller: { not: null },
      },
      select: { userId: true, buyerRatingOfSeller: true },
    }),
    prisma.marketItem.findMany({
      where: {
        selectedBuyerId: { in: uniqueIds },
        status: MarketItemStatus.COMPLETED,
        sellerRatingOfBuyer: { not: null },
      },
      select: { selectedBuyerId: true, sellerRatingOfBuyer: true },
    }),
  ]);

  const stats = new Map<string, { thumbsUp: number; total: number }>();

  for (const item of asSeller) {
    const existing = stats.get(item.userId) ?? { thumbsUp: 0, total: 0 };
    existing.total += 1;
    if (item.buyerRatingOfSeller === true) existing.thumbsUp += 1;
    stats.set(item.userId, existing);
  }

  for (const item of asBuyer) {
    if (!item.selectedBuyerId) continue;
    const existing = stats.get(item.selectedBuyerId) ?? { thumbsUp: 0, total: 0 };
    existing.total += 1;
    if (item.sellerRatingOfBuyer === true) existing.thumbsUp += 1;
    stats.set(item.selectedBuyerId, existing);
  }

  const result = new Map<string, { thumbsUp: number; total: number; rate: number }>();
  for (const uid of uniqueIds) {
    const s = stats.get(uid);
    const total = s?.total ?? 0;
    const thumbsUp = s?.thumbsUp ?? 0;
    result.set(uid, { thumbsUp, total, rate: total > 0 ? Math.round((thumbsUp / total) * 100) : 0 });
  }
  return result;
}
