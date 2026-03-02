"use server";

/**
 * 生存集市 Server Actions
 * 创建、更新状态、举报、删除商品、获取分类
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthCookie, getCurrentUser } from "@/lib/auth-server-actions";
import { validateContent } from "@/lib/content-validator";
import {
  MarketItemStatus,
  NotificationType,
  NotificationEntityType,
} from "@prisma/client";
import { createNotification } from "@/lib/notification-actions";

/** 集市商品审计日志动作类型（与 Prisma MarketLogActionType 枚举一致） */
const MarketLogActionType = {
  INTENTION_CREATED: "INTENTION_CREATED",
  INTENTION_WITHDRAWN: "INTENTION_WITHDRAWN",
  ITEM_LOCKED: "ITEM_LOCKED",
  ITEM_UNLOCKED: "ITEM_UNLOCKED",
  INTENTION_RESET_BY_UNLOCK: "INTENTION_RESET_BY_UNLOCK",
  INTENTION_AUTO_WITHDRAWN_ON_UNLOCK: "INTENTION_AUTO_WITHDRAWN_ON_UNLOCK",
  TRANSACTION_COMPLETED: "TRANSACTION_COMPLETED",
  BUYER_CONFIRMED: "BUYER_CONFIRMED",
  SELLER_CONFIRMED: "SELLER_CONFIRMED",
  ITEM_EDITED: "ITEM_EDITED",
  ADMIN_HIDDEN: "ADMIN_HIDDEN",
  ADMIN_RELISTED: "ADMIN_RELISTED",
  ITEM_DELETED: "ITEM_DELETED",
  AUTO_UNLOCKED: "AUTO_UNLOCKED",
  AUTO_COMPLETED: "AUTO_COMPLETED",
} as const;

/** 创建集市商品审计日志（在事务内调用时传入 tx 以保持一致性） */
async function createMarketLog(
  itemId: string,
  userId: string,
  actionType: (typeof MarketLogActionType)[keyof typeof MarketLogActionType],
  details?: string | null,
  tx?: unknown
) {
  const client = tx ?? prisma;
  // 事务客户端与 prisma 均有 marketLog，运行时可用
  await (client as { marketLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }).marketLog.create({
    data: { itemId, userId, actionType, details: details ?? null },
  });
}

/** 获取系统用户 ID（用于自动操作的审计日志，如超级管理员） */
async function getSystemUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { role: 4 },
    select: { id: true },
  });
  return user?.id ?? null;
}

const AUTO_UNLOCK_HOURS = 48;
const AUTO_COMPLETE_HOURS = 24;

/**
 * 集市死锁保护：自动解锁与单方自动完成
 * - 自动解锁：LOCKED 超过 48 小时且双方均未确认 → 恢复 ACTIVE，清空 selectedBuyerId
 * - 单方自动完成：一方已确认，另一方 24 小时内未确认 → 自动设为 COMPLETED
 * 可在数据拉取时调用，或由 cron 定期触发
 */
export async function processMarketDeadlocks(): Promise<void> {
  try {
    const systemUserId = await getSystemUserId();
    const now = new Date();
    const unlockThreshold = new Date(now.getTime() - AUTO_UNLOCK_HOURS * 60 * 60 * 1000);
    const completeThreshold = new Date(now.getTime() - AUTO_COMPLETE_HOURS * 60 * 60 * 1000);

    // 1. 自动解锁：lockedAt 超过 48h，且双方都未确认
    const toUnlock = await prisma.marketItem.findMany({
      where: {
        status: MarketItemStatus.LOCKED,
        lockedAt: { lt: unlockThreshold },
        buyerConfirmed: false,
        sellerConfirmed: false,
      },
      select: {
        id: true,
        userId: true,
        selectedBuyerId: true,
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
            firstConfirmedAt: null,
          },
        });
        if (systemUserId) {
          await createMarketLog(
            item.id,
            systemUserId,
            MarketLogActionType.AUTO_UNLOCKED,
            "48 小时内双方均未确认，自动解锁",
            tx
          );
        }
      });

      const titlePreview =
        (item.title || "").length > 30 ? `${(item.title || "").slice(0, 30)}…` : item.title || "";
      const msg = `物品「${titlePreview}」因 48 小时内双方均未确认交易，已自动解锁并重新上架。`;
      if (item.userId) {
        await createNotification(
          item.userId,
          null,
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          msg
        );
      }
      if (item.selectedBuyerId && item.selectedBuyerId !== item.userId) {
        await createNotification(
          item.selectedBuyerId,
          null,
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          msg
        );
      }
    }

    // 2. 单方自动完成：firstConfirmedAt 超过 24h，且仅一方已确认
    const toComplete = await prisma.marketItem.findMany({
      where: {
        status: MarketItemStatus.LOCKED,
        firstConfirmedAt: { lt: completeThreshold, not: null },
        OR: [
          { buyerConfirmed: true, sellerConfirmed: false },
          { buyerConfirmed: false, sellerConfirmed: true },
        ],
      },
      select: {
        id: true,
        userId: true,
        selectedBuyerId: true,
        buyerConfirmed: true,
        sellerConfirmed: true,
        title: true,
      },
    });

    for (const item of toComplete) {
      const otherUserId = item.buyerConfirmed ? item.userId : item.selectedBuyerId;

      await prisma.$transaction(async (tx) => {
        await tx.marketItem.update({
          where: { id: item.id },
          data: { status: MarketItemStatus.COMPLETED },
        });
        if (systemUserId) {
          await createMarketLog(
            item.id,
            systemUserId,
            MarketLogActionType.AUTO_COMPLETED,
            "Auto-completed by single confirmation",
            tx
          );
        }
      });

      const titlePreview =
        (item.title || "").length > 30 ? `${(item.title || "").slice(0, 30)}…` : item.title || "";
      const msg = `物品「${titlePreview}」因对方 24 小时内未确认，已自动完成交易。`;
      if (otherUserId) {
        await createNotification(
          otherUserId,
          null,
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          msg
        );
      }
    }
  } catch (err) {
    console.error("[processMarketDeadlocks]", err);
  }
}

/** 按交易类型 ID 分组的物品分类（用户端） */
export type MarketCategoriesByType = Record<
  number,
  Array<{ id: string; name: string; order: number }>
>;

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

/** 集市分类与交易类型（用于发布表单等） */
export interface MarketCategoriesResult {
  data: MarketCategoriesByType;
  transactionTypes: Array<{ id: number; name: string; code: string; order: number }>;
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

/** 用户集市声誉（按角色聚合） */
export interface UserReputation {
  totalEvaluations: number;
  goodRatings: number;
  approvalRate: number | null;
}

/** 公开集市商品列表项 */
export interface PublicMarketItemEntry {
  id: string;
  poiId: string;
  categoryId: string | null;
  typeId: number;
  transactionType: { id: number; name: string; code: string };
  title: string;
  description: string;
  price: number | null;
  images: string[];
  status: string;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
}

/** 公开集市商品详情（含 hasSubmittedIntention、masked、intentionsCount 等） */
export interface PublicMarketItemDetail extends PublicMarketItemEntry {
  contact: string | null;
  user: { id: string; nickname: string | null };
  selectedBuyerId: string | null;
  buyerId: string | null;
  buyer: { id: string; nickname: string | null } | null;
  selectedBuyer: { id: string; nickname: string | null } | null;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  lockedAt: string | null;
  hasSubmittedIntention: boolean;
  /** 表达意向的独立用户数（社交证明） */
  intentionsCount: number;
  /** 买家对卖家的评价（true=好评，false=差评） */
  buyerRatingOfSeller?: boolean | null;
  /** 卖家对买家的评价 */
  sellerRatingOfBuyer?: boolean | null;
  /** 卖家好评率 0-100 */
  sellerThumbsUpRate?: number;
  /** 买家好评率 0-100 */
  buyerThumbsUpRate?: number;
  /** 卖家声誉（交易完成后的评价聚合） */
  sellerReputation?: UserReputation;
  masked?: boolean;
  message?: string;
}

/**
 * 获取生存集市商品列表（公开）
 * schoolId 必填，可选 typeId、categoryId、poiId 筛选
 */
export async function getPublicMarketItems(
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
      isHidden: false,
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
        images: (item.images as string[]) ?? [],
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

/**
 * 获取单个集市商品详情
 * - 公开：仅 ACTIVE 且未过期、未隐藏
 * - 登录且为卖家或买家：可获取 LOCKED/COMPLETED 状态商品
 */
export async function getMarketItemDetail(
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
                { userId: auth.userId },
                { selectedBuyerId: auth.userId },
                { intentions: { some: { userId: auth.userId } } },
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
        isHidden: true,
        selectedBuyerId: true,
        buyerConfirmed: true,
        sellerConfirmed: true,
        lockedAt: true,
        buyerRatingOfSeller: true,
        sellerRatingOfBuyer: true,
        expiresAt: true,
        createdAt: true,
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

    const [hasSubmittedIntention, intentionsCount, sellerThumbsUp, buyerThumbsUp, sellerReputation] =
      await Promise.all([
        auth?.userId
          ? prisma.marketIntention
              .findUnique({
                where: { itemId_userId: { itemId: item.id, userId: auth.userId } },
                select: { id: true },
              })
              .then((r) => r != null)
          : false,
        prisma.marketIntention.count({ where: { itemId: item.id } }),
        item.user?.id ? getMarketThumbsUpRate(item.user.id).then((r) => r.data) : null,
        item.selectedBuyer?.id ? getMarketThumbsUpRate(item.selectedBuyer.id).then((r) => r.data) : null,
        item.user?.id ? getUserReputation(item.user.id, "seller").then((r) => r.data) : null,
      ]);

    if (item.isHidden) {
      return {
        success: true,
        data: {
          id: item.id,
          poiId: item.poiId,
          categoryId: item.categoryId,
          typeId: item.typeId,
          transactionType: item.transactionType,
          title: "",
          description: "",
          contact: null,
          price: item.price,
          images: [],
          status: item.status,
          expiresAt: item.expiresAt.toISOString(),
          createdAt: item.createdAt.toISOString(),
          poi: item.poi,
          category: item.category,
          user: item.user,
          selectedBuyerId: item.selectedBuyerId,
          buyerId: item.selectedBuyerId,
          buyer: item.selectedBuyer,
          selectedBuyer: item.selectedBuyer,
          buyerConfirmed: item.buyerConfirmed,
          sellerConfirmed: item.sellerConfirmed,
          lockedAt: item.lockedAt?.toISOString() ?? null,
          hasSubmittedIntention: Boolean(hasSubmittedIntention),
          intentionsCount,
          buyerRatingOfSeller: item.buyerRatingOfSeller ?? undefined,
          sellerRatingOfBuyer: item.sellerRatingOfBuyer ?? undefined,
          sellerThumbsUpRate: sellerThumbsUp?.rate,
          buyerThumbsUpRate: buyerThumbsUp?.rate,
          sellerReputation: sellerReputation ?? undefined,
          masked: true,
          message: "内容已被屏蔽",
        },
      };
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
        contact: item.contact,
        price: item.price,
        images: (item.images as string[]) ?? [],
        status: item.status,
        selectedBuyerId: item.selectedBuyerId,
        buyerId: item.selectedBuyerId,
        buyerConfirmed: item.buyerConfirmed,
        sellerConfirmed: item.sellerConfirmed,
        lockedAt: item.lockedAt?.toISOString() ?? null,
        buyerRatingOfSeller: item.buyerRatingOfSeller ?? undefined,
        sellerRatingOfBuyer: item.sellerRatingOfBuyer ?? undefined,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        poi: item.poi,
        category: item.category,
        user: item.user,
        buyer: item.selectedBuyer,
        selectedBuyer: item.selectedBuyer,
        hasSubmittedIntention: Boolean(hasSubmittedIntention),
        intentionsCount,
        sellerThumbsUpRate: sellerThumbsUp?.rate,
        buyerThumbsUpRate: buyerThumbsUp?.rate,
        sellerReputation: sellerReputation ?? undefined,
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

const EXPIRY_DAYS = 7;
const MAX_IMAGES = 9;

/** 更新商品 payload 的 Zod 校验 schema */
const UpdateMarketItemPayloadSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(2000).optional(),
  price: z.number().min(0).nullable().optional(),
  images: z.array(z.string()).max(MAX_IMAGES).optional(),
  categoryId: z.string().nullable().optional(),
  poiId: z.string().min(1).optional(),
  contact: z.string().max(100).nullable().optional(),
});

export type UpdateMarketItemPayload = z.infer<typeof UpdateMarketItemPayloadSchema>;

export interface MarketActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateMarketItemDTO {
  poiId: string;
  categoryId?: string | null;
  typeId: number;
  title: string;
  description: string;
  contact?: string | null;
  price?: number | null;
  images: string[];
}

export interface MarketItemResult {
  id: string;
  poiId: string;
  categoryId: string | null;
  typeId: number;
  title: string;
  description: string;
  contact: string | null;
  price: number | null;
  images: string[];
  status: string;
  reportCount: number;
  expiresAt: string;
  createdAt: string;
}

/** 中控台集市列表项（与 API 返回格式一致） */
export interface MyMarketItemEntry {
  id: string;
  title: string;
  price: number | null;
  images: string[];
  status: string;
  buyerId?: string | null;
  selectedBuyerId: string | null;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  lockedAt: string | null;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
  transactionType: { id: number; name: string; code: string };
  buyer?: { id: string; nickname: string | null } | null;
  seller?: { id: string; nickname: string | null } | null;
  /** 仅 buying 列表：当前用户是否仍有意向（false 表示曾撤回，可 Re-add） */
  hasIntention?: boolean;
  /** 是否被下架 */
  isHidden?: boolean;
  /** 买家对卖家的评价（true=好评，false=差评，null=未评价） */
  buyerRatingOfSeller?: boolean | null;
  /** 卖家对买家的评价 */
  sellerRatingOfBuyer?: boolean | null;
}

/**
 * 集市活动分组（2 类，前端可二次筛选）
 * - selling: 作为卖家（userId === currentUserId）
 * - buying: 作为买家（有意向 OR selectedBuyerId === currentUserId）
 */
export interface MyMarketItemsResult {
  selling: MyMarketItemEntry[];
  buying: MyMarketItemEntry[];
}

const MARKET_ITEM_SELECT = {
  id: true,
  title: true,
  price: true,
  images: true,
  status: true,
  selectedBuyerId: true,
  buyerConfirmed: true,
  sellerConfirmed: true,
  lockedAt: true,
  expiresAt: true,
  createdAt: true,
  isHidden: true,
  buyerRatingOfSeller: true,
  sellerRatingOfBuyer: true,
  poi: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  transactionType: { select: { id: true, name: true, code: true } },
  selectedBuyer: { select: { id: true, nickname: true } },
  user: { select: { id: true, nickname: true } },
} as const;

function formatMarketItemForList(
  item: {
    id: string;
    title: string;
    price: number | null;
    images: unknown;
    status: string;
    selectedBuyerId: string | null;
    buyerConfirmed: boolean;
    sellerConfirmed: boolean;
    lockedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    isHidden?: boolean;
    buyerRatingOfSeller?: boolean | null;
    sellerRatingOfBuyer?: boolean | null;
    poi: { id: string; name: string };
    category: { id: string; name: string } | null;
    transactionType: { id: number; name: string; code: string };
    selectedBuyer?: { id: string; nickname: string | null } | null;
    user?: { id: string; nickname: string | null };
  },
  role: "seller" | "buyer",
  extra?: { hasIntention?: boolean }
): MyMarketItemEntry {
  return {
    id: item.id,
    title: item.title,
    price: item.price,
    images: (item.images as string[]) ?? [],
    status: item.status,
    buyerId: item.selectedBuyerId,
    selectedBuyerId: item.selectedBuyerId,
    buyerConfirmed: item.buyerConfirmed,
    sellerConfirmed: item.sellerConfirmed,
    lockedAt: item.lockedAt?.toISOString() ?? null,
    expiresAt: item.expiresAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    poi: item.poi,
    category: item.category,
    transactionType: item.transactionType,
    ...(item.isHidden !== undefined && { isHidden: item.isHidden }),
    ...(item.buyerRatingOfSeller !== undefined && { buyerRatingOfSeller: item.buyerRatingOfSeller }),
    ...(item.sellerRatingOfBuyer !== undefined && { sellerRatingOfBuyer: item.sellerRatingOfBuyer }),
    ...(role === "seller"
      ? { buyer: item.selectedBuyer }
      : { seller: item.user }),
    ...(extra?.hasIntention !== undefined && { hasIntention: extra.hasIntention }),
  };
}

/**
 * 获取当前用户的集市活动（2 类分组，含完整 status/isHidden，前端可二次筛选）
 * - selling: 作为卖家（userId === currentUserId）
 * - buying: 作为买家（有意向 OR selectedBuyerId === currentUserId），排除 isHidden
 */
export async function getMyMarketItems(): Promise<
  MarketActionResult<MyMarketItemsResult>
> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    await processMarketDeadlocks();

    const uid = auth.userId;

    const [sellingItems, intentions, buyingItemsRaw] = await Promise.all([
      // selling: 我发布的所有商品（含 ACTIVE/LOCKED/COMPLETED/EXPIRED/DELETED/isHidden）
      prisma.marketItem.findMany({
        where: { userId: uid },
        select: MARKET_ITEM_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      // 有意向的记录（用于 hasIntention）
      prisma.marketIntention.findMany({
        where: { userId: uid },
        select: { itemId: true },
      }),
      // buying: 有意向 OR selectedBuyerId，排除 isHidden
      prisma.marketItem.findMany({
        where: {
          isHidden: false,
          OR: [
            { intentions: { some: { userId: uid } } },
            { selectedBuyerId: uid },
          ],
        },
        select: MARKET_ITEM_SELECT,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const intentionItemIds = new Set(intentions.map((i) => i.itemId));

    return {
      success: true,
      data: {
        selling: sellingItems.map((i) => formatMarketItemForList(i, "seller")),
        buying: buyingItemsRaw.map((i) =>
          formatMarketItemForList(i, "buyer", { hasIntention: intentionItemIds.has(i.id) })
        ),
      },
    };
  } catch (err) {
    console.error("[getMyMarketItems]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取集市数据失败",
    };
  }
}

/**
 * 创建集市商品
 * - 从 session 注入 schoolId、userId
 * - expiresAt = now + 7 天
 * - title、description 做内容校验并启用 6 位数字屏蔽
 * - contact 不做数字屏蔽，原样存储
 */
export async function createMarketItem(
  data: CreateMarketItemDTO
): Promise<MarketActionResult<MarketItemResult>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录后再发布" };
    }

    const { poiId, categoryId, typeId, title, description, contact, price, images } = data;

    if (!poiId?.trim() || !title?.trim() || !description?.trim()) {
      return { success: false, error: "poiId、title、description 为必填项" };
    }

    if (title.trim().length > 100) {
      return { success: false, error: "标题最多 100 字" };
    }

    if (description.trim().length > 2000) {
      return { success: false, error: "描述最多 2000 字" };
    }

    if (contact != null && contact.trim().length > 100) {
      return { success: false, error: "联系方式最多 100 字" };
    }

    // 校验交易类型存在且启用
    const transactionType = await prisma.marketTransactionType.findFirst({
      where: { id: typeId, isActive: true },
      select: { id: true, code: true },
    });
    if (!transactionType) {
      return { success: false, error: "交易类型不存在或已停用" };
    }

    // code=SALE 的类型必填价格
    if (transactionType.code === "SALE") {
      if (price == null || typeof price !== "number" || price < 0) {
        return { success: false, error: "二手交易需填写有效价格" };
      }
    }

    const imagesArr = Array.isArray(images) ? images.filter((u): u is string => typeof u === "string") : [];
    if (imagesArr.length > MAX_IMAGES) {
      return { success: false, error: `图片最多 ${MAX_IMAGES} 张` };
    }

    // title：敏感词校验 + 6 位数字屏蔽
    let sanitizedTitle: string;
    try {
      sanitizedTitle = (await validateContent(title.trim(), { maskNumbers: true })).trim();
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    // description：敏感词校验 + 6 位数字屏蔽
    let sanitizedDescription: string;
    try {
      sanitizedDescription = (await validateContent(description.trim(), { maskNumbers: true })).trim();
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    // contact：不做数字屏蔽，仅做敏感词校验（可选，按需求可跳过）
    if (contact != null && contact.trim().length > 0) {
      try {
        await validateContent(contact.trim(), { maskNumbers: false });
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "联系方式包含敏感词汇，请修改后重试。",
        };
      }
    }

    // 校验 POI 存在且用户有权限
    const poi = await prisma.pOI.findFirst({
      where: { id: poiId.trim() },
      select: { id: true, schoolId: true },
    });

    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    if (auth.schoolId !== null && auth.schoolId !== poi.schoolId) {
      return { success: false, error: "无权在该 POI 发布商品" };
    }

    // 校验分类存在且启用，且已关联到该交易类型（若提供 categoryId）
    let resolvedCategoryId: string | null = null;
    if (categoryId != null && categoryId.trim().length > 0) {
      const link = await prisma.marketTypeCategory.findUnique({
        where: {
          transactionTypeId_categoryId: {
            transactionTypeId: typeId,
            categoryId: categoryId.trim(),
          },
        },
        include: { category: { select: { id: true, isActive: true } } },
      });
      if (!link || !link.category.isActive) {
        return { success: false, error: "该物品分类不存在、已停用或未关联到当前交易类型" };
      }
      resolvedCategoryId = link.category.id;
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const item = await prisma.marketItem.create({
      data: {
        schoolId: poi.schoolId,
        poiId: poi.id,
        userId: auth.userId,
        typeId: transactionType.id,
        categoryId: resolvedCategoryId,
        title: sanitizedTitle,
        description: sanitizedDescription,
        contact: contact?.trim() || null,
        price: transactionType.code === "SALE" ? (price as number) : null,
        images: imagesArr,
        status: MarketItemStatus.ACTIVE,
        expiresAt,
      },
    });

    return {
      success: true,
      data: {
        id: item.id,
        poiId: item.poiId,
        categoryId: item.categoryId ?? null,
        typeId: item.typeId,
        title: item.title,
        description: item.description,
        contact: item.contact,
        price: item.price,
        images: (item.images as string[]) ?? [],
        status: item.status,
        reportCount: item.reportCount,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[createMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "发布失败",
    };
  }
}

/**
 * 更新集市商品
 * - 仅商品所有者可编辑
 * - 仅 ACTIVE 状态的商品可编辑
 * - title、description、contact 做内容校验（与 create 一致）
 */
export async function updateMarketItem(
  itemId: string,
  payload: UpdateMarketItemPayload
): Promise<MarketActionResult<MarketItemResult>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userId) {
      return { success: false, error: "请先登录" };
    }

    const parsed = UpdateMarketItemPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const msg = firstIssue?.message ?? "参数校验失败";
      return { success: false, error: msg };
    }

    const data = parsed.data;

    // 至少提供一个可更新字段
    const hasUpdates =
      data.title !== undefined ||
      data.description !== undefined ||
      data.price !== undefined ||
      data.images !== undefined ||
      data.categoryId !== undefined ||
      data.poiId !== undefined ||
      data.contact !== undefined;

    if (!hasUpdates) {
      return { success: false, error: "请提供至少一个要更新的字段" };
    }

    // 先查询商品，校验所有权与状态（含 title/description/price 用于编辑日志）
    const existing = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: {
        id: true,
        userId: true,
        schoolId: true,
        typeId: true,
        status: true,
        title: true,
        description: true,
        price: true,
        transactionType: { select: { code: true } },
      },
    });

    if (!existing) {
      return { success: false, error: "无权限或商品不存在" };
    }

    if (existing.userId !== currentUser.userId) {
      return { success: false, error: "无权限或商品不存在" };
    }

    if (existing.status !== MarketItemStatus.ACTIVE) {
      return { success: false, error: "仅 ACTIVE 状态的商品可编辑" };
    }

    // 内容校验
    let sanitizedTitle: string | undefined;
    if (data.title !== undefined) {
      try {
        sanitizedTitle = (await validateContent(data.title.trim(), { maskNumbers: true })).trim();
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }

    let sanitizedDescription: string | undefined;
    if (data.description !== undefined) {
      try {
        sanitizedDescription = (await validateContent(data.description.trim(), { maskNumbers: true })).trim();
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }

    if (data.contact !== undefined && data.contact != null && data.contact.trim().length > 0) {
      try {
        await validateContent(data.contact.trim(), { maskNumbers: false });
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "联系方式包含敏感词汇，请修改后重试。",
        };
      }
    }

    // 校验 poiId（若提供）
    let resolvedPoiId: string | undefined;
    if (data.poiId !== undefined) {
      const poi = await prisma.pOI.findFirst({
        where: { id: data.poiId.trim() },
        select: { id: true, schoolId: true },
      });
      if (!poi) {
        return { success: false, error: "POI 不存在" };
      }
      if (currentUser.schoolId !== null && currentUser.schoolId !== poi.schoolId) {
        return { success: false, error: "无权在该 POI 发布商品" };
      }
      resolvedPoiId = poi.id;
    }

    // 校验 categoryId（若提供）
    let resolvedCategoryId: string | null | undefined;
    if (data.categoryId !== undefined) {
      if (data.categoryId == null || data.categoryId.trim().length === 0) {
        resolvedCategoryId = null;
      } else {
        const link = await prisma.marketTypeCategory.findUnique({
          where: {
            transactionTypeId_categoryId: {
              transactionTypeId: existing.typeId,
              categoryId: data.categoryId.trim(),
            },
          },
          include: { category: { select: { id: true, isActive: true } } },
        });
        if (!link || !link.category.isActive) {
          return { success: false, error: "该物品分类不存在、已停用或未关联到当前交易类型" };
        }
        resolvedCategoryId = link.category.id;
      }
    }

    // SALE 类型若提供 price 需有效
    if (existing.transactionType.code === "SALE" && data.price !== undefined) {
      if (data.price == null || data.price < 0) {
        return { success: false, error: "二手交易需填写有效价格" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (sanitizedTitle !== undefined) updateData.title = sanitizedTitle;
    if (sanitizedDescription !== undefined) updateData.description = sanitizedDescription;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.images !== undefined) updateData.images = data.images;
    if (resolvedCategoryId !== undefined) updateData.categoryId = resolvedCategoryId;
    if (resolvedPoiId !== undefined) updateData.poiId = resolvedPoiId;
    if (data.contact !== undefined) updateData.contact = data.contact?.trim() || null;

    const item = await prisma.marketItem.update({
      where: { id: itemId.trim(), userId: currentUser.userId },
      data: updateData,
    });

    // 审计日志：仅对 title、description、price 变更记录 ITEM_EDITED
    const editParts: string[] = [];
    if (sanitizedTitle !== undefined && sanitizedTitle !== existing.title) {
      editParts.push("title");
    }
    if (sanitizedDescription !== undefined && sanitizedDescription !== existing.description) {
      editParts.push("description");
    }
    if (data.price !== undefined) {
      const oldPrice = existing.price;
      const newPrice = data.price;
      if (oldPrice !== newPrice) {
        editParts.push(`price from ${oldPrice ?? "null"} to ${newPrice ?? "null"}`);
      }
    }
    if (editParts.length > 0) {
      const details = editParts.map((p) => `Updated ${p}`).join("; ");
      await createMarketLog(item.id, currentUser.userId, MarketLogActionType.ITEM_EDITED, details);
    }

    revalidatePath("/");
    revalidatePath("/profile");

    return {
      success: true,
      data: {
        id: item.id,
        poiId: item.poiId,
        categoryId: item.categoryId ?? null,
        typeId: item.typeId,
        title: item.title,
        description: item.description,
        contact: item.contact,
        price: item.price,
        images: (item.images as string[]) ?? [],
        status: item.status,
        reportCount: item.reportCount,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
      },
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2025") {
      return { success: false, error: "无权限或商品不存在" };
    }
    console.error("[updateMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}

/** 创建交易类型（仅超级管理员） */
export async function createTransactionType(data: {
  name: string;
  code: string;
  order?: number;
}): Promise<MarketActionResult<{ id: number; name: string; code: string; order: number }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const trimmedName = data.name.trim();
    const trimmedCode = data.code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      return { success: false, error: "名称和 code 不能为空" };
    }
    const existing = await prisma.marketTransactionType.findFirst({
      where: { OR: [{ name: trimmedName }, { code: trimmedCode }] },
    });
    if (existing) {
      return { success: false, error: "名称或 code 已存在" };
    }
    const created = await prisma.marketTransactionType.create({
      data: {
        name: trimmedName,
        code: trimmedCode,
        order: typeof data.order === "number" ? data.order : 0,
      },
    });
    return {
      success: true,
      data: {
        id: created.id,
        name: created.name,
        code: created.code,
        order: created.order,
      },
    };
  } catch (err) {
    console.error("[createTransactionType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

/** 更新交易类型（仅超级管理员） */
export async function updateTransactionType(
  id: number,
  data: { name?: string; code?: string; order?: number; isActive?: boolean }
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const existing = await prisma.marketTransactionType.findUnique({
      where: { id },
    });
    if (!existing) {
      return { success: false, error: "交易类型不存在" };
    }
    const updates: { name?: string; code?: string; order?: number; isActive?: boolean } = {};
    if (data.name !== undefined) {
      const t = data.name.trim();
      if (!t) return { success: false, error: "名称不能为空" };
      updates.name = t;
    }
    if (data.code !== undefined) {
      const c = data.code.trim().toUpperCase();
      if (!c) return { success: false, error: "code 不能为空" };
      updates.code = c;
    }
    if (data.order !== undefined) updates.order = data.order;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    await prisma.marketTransactionType.update({
      where: { id },
      data: updates,
    });
    return { success: true };
  } catch (err) {
    console.error("[updateTransactionType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}

/** 删除交易类型（仅超级管理员，有关联商品时禁止） */
export async function deleteTransactionType(id: number): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const existing = await prisma.marketTransactionType.findUnique({
      where: { id },
      include: { _count: { select: { marketItems: true } } },
    });
    if (!existing) {
      return { success: false, error: "交易类型不存在" };
    }
    if (existing._count.marketItems > 0) {
      return {
        success: false,
        error: `该类型下仍有 ${existing._count.marketItems} 个商品，无法删除`,
      };
    }
    await prisma.marketTransactionType.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    console.error("[deleteTransactionType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

/** 创建物品分类（仅超级管理员） */
export async function createMarketCategory(data: {
  name: string;
  order?: number;
}): Promise<
  MarketActionResult<{
    id: string;
    name: string;
    order: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>
> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const trimmedName = data.name.trim();
    if (!trimmedName) return { success: false, error: "分类名称不能为空" };
    if (trimmedName.length > 50) return { success: false, error: "分类名称过长（最多 50 字）" };
    const existing = await prisma.marketCategory.findFirst({
      where: { name: trimmedName, isActive: true },
    });
    if (existing) return { success: false, error: "已存在同名分类" };
    const category = await prisma.marketCategory.create({
      data: {
        name: trimmedName,
        order: typeof data.order === "number" ? data.order : 0,
      },
    });
    return {
      success: true,
      data: {
        id: category.id,
        name: category.name,
        order: category.order,
        isActive: category.isActive,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[createMarketCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

/** 更新物品分类（仅超级管理员） */
export async function updateMarketCategory(
  id: string,
  data: { name?: string; order?: number; isActive?: boolean }
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const existing = await prisma.marketCategory.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "分类不存在" };
    const updates: { name?: string; order?: number; isActive?: boolean } = {};
    if (data.name !== undefined) {
      const t = data.name.trim();
      if (!t) return { success: false, error: "分类名称不能为空" };
      if (t.length > 50) return { success: false, error: "分类名称过长（最多 50 字）" };
      updates.name = t;
    }
    if (data.order !== undefined) updates.order = data.order;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    await prisma.marketCategory.update({ where: { id }, data: updates });
    return { success: true };
  } catch (err) {
    console.error("[updateMarketCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}

/** 删除物品分类（仅超级管理员，有关联商品时禁止） */
export async function deleteMarketCategory(id: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const category = await prisma.marketCategory.findUnique({
      where: { id },
      include: { _count: { select: { marketItems: true } } },
    });
    if (!category) return { success: false, error: "分类不存在" };
    if (category._count.marketItems > 0) {
      return {
        success: false,
        error: `该分类下仍有 ${category._count.marketItems} 个商品，无法删除`,
      };
    }
    await prisma.marketCategory.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    console.error("[deleteMarketCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

/** 切换交易类型与物品分类的关联（仅超级管理员） */
export async function toggleTypeCategory(
  typeId: number,
  categoryId: string
): Promise<MarketActionResult<{ linked: boolean }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const [transactionType, category] = await Promise.all([
      prisma.marketTransactionType.findUnique({ where: { id: typeId } }),
      prisma.marketCategory.findUnique({ where: { id: categoryId.trim() } }),
    ]);
    if (!transactionType) return { success: false, error: "交易类型不存在" };
    if (!category) return { success: false, error: "分类不存在" };
    const existing = await prisma.marketTypeCategory.findUnique({
      where: {
        transactionTypeId_categoryId: {
          transactionTypeId: typeId,
          categoryId: category.id,
        },
      },
    });
    if (existing) {
      await prisma.marketTypeCategory.delete({
        where: {
          transactionTypeId_categoryId: {
            transactionTypeId: typeId,
            categoryId: category.id,
          },
        },
      });
      return { success: true, data: { linked: false } };
    } else {
      await prisma.marketTypeCategory.create({
        data: {
          transactionTypeId: typeId,
          categoryId: category.id,
        },
      });
      return { success: true, data: { linked: true } };
    }
  } catch (err) {
    console.error("[toggleTypeCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/**
 * 更新商品状态（ACTIVE / LOCKED / COMPLETED）
 * @deprecated 建议使用 lockMarketItem / unlockMarketItem / confirmTransaction
 */
export async function updateMarketItemStatus(
  itemId: string,
  status: MarketItemStatus
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    if (
      status !== MarketItemStatus.ACTIVE &&
      status !== MarketItemStatus.LOCKED &&
      status !== MarketItemStatus.COMPLETED
    ) {
      return { success: false, error: "状态只能设置为 ACTIVE、LOCKED 或 COMPLETED" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, schoolId: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    const isOwner = item.userId === auth.userId;
    const isAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
    const sameSchool = auth.schoolId !== null && auth.schoolId === item.schoolId;

    if (!isOwner && !(isAdmin && sameSchool)) {
      return { success: false, error: "无权修改该商品状态" };
    }

    await prisma.marketItem.update({
      where: { id: item.id },
      data: { status },
    });

    return { success: true };
  } catch (err) {
    console.error("[updateMarketItemStatus]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}

/** 意向记录（含用户信息与买家声誉） */
export interface MarketIntentionWithUser {
  id: number;
  itemId: string;
  userId: string;
  contactInfo: string | null;
  createdAt: string;
  user: { id: string; nickname: string | null; avatar: string | null };
  /** 该买家作为买家的声誉（卖家评价聚合） */
  reputation?: UserReputation;
}

/**
 * 提交意向（我有意向）：在 MarketIntention 中创建记录
 * 前置条件：当前用户不是卖家；同一用户对同一商品只能提交一次
 */
export async function submitIntention(
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

    if (auth.schoolId !== null && auth.schoolId !== item.schoolId) {
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

/**
 * 卖家选定买家并锁定：设置 selectedBuyerId，状态改为 LOCKED
 * buyerId 必须来自该商品的意向列表
 */
export async function selectBuyerAndLock(
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

    await prisma.$transaction(async (tx) => {
      await tx.marketItem.update({
        where: { id: item.id },
        data: {
          selectedBuyerId: buyerId.trim(),
          status: MarketItemStatus.LOCKED,
          lockedAt: new Date(),
          buyerConfirmed: false,
          sellerConfirmed: false,
        },
      });
      await createMarketLog(
        item.id,
        auth.userId,
        MarketLogActionType.ITEM_LOCKED,
        lockDetails,
        tx
      );
    });

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

/**
 * 获取商品的所有意向记录（含用户昵称、头像）
 * 仅卖家可查看
 */
export async function getIntentions(
  itemId: string
): Promise<MarketActionResult<MarketIntentionWithUser[]>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId !== auth.userId) {
      return { success: false, error: "仅卖家可查看意向列表" };
    }

    const intentions = await prisma.marketIntention.findMany({
      where: { itemId: item.id },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const reputations = await Promise.all(
      intentions.map((i) => getUserReputation(i.userId, "buyer").then((r) => r.data))
    );

    return {
      success: true,
      data: intentions.map((intention, idx) => ({
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
        reputation: reputations[idx] ?? undefined,
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

/**
 * 撤回意向：买家取消对某商品的意向
 * 仅 ACTIVE 状态的商品可撤回
 */
export async function withdrawIntention(itemId: string): Promise<MarketActionResult> {
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

    if (item.status !== MarketItemStatus.ACTIVE) {
      return { success: false, error: "只有在售商品可撤回意向" };
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

/**
 * @deprecated 请使用 submitIntention(itemId, contactInfo)。保留以兼容旧调用。
 */
export const requestMarketItem = submitIntention;

/**
 * 卖家锁定商品：选定买家后锁定（需先调用 selectBuyerAndLock）
 * @deprecated 请使用 selectBuyerAndLock(itemId, buyerId)
 */
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

/**
 * 卖家解锁商品：状态改回 ACTIVE，清空 selectedBuyerId 及确认状态（线下交易未成时使用）
 * 同时删除被锁定买家的意向记录，强制其重新表达意向（Fresh Start）
 */
export async function unlockMarketItem(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, schoolId: true, status: true, selectedBuyerId: true, title: true },
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

    // 获取买家邮箱（用于审计日志详情）
    let buyerEmail: string | null = null;
    if (formerBuyerId) {
      const buyer = await prisma.user.findUnique({
        where: { id: formerBuyerId },
        select: { email: true },
      });
      buyerEmail = buyer?.email ?? null;
    }

    await prisma.$transaction(async (tx) => {
      // Step 1: 删除被锁定买家的意向记录（Fresh Start）
      if (formerBuyerId) {
        await tx.marketIntention.deleteMany({
          where: {
            itemId: item.id,
            userId: formerBuyerId,
          },
        });
      }

      // Step 2 & 3: 重置商品状态
      await tx.marketItem.update({
        where: { id: item.id },
        data: {
          status: MarketItemStatus.ACTIVE,
          selectedBuyerId: null,
          buyerConfirmed: false,
          sellerConfirmed: false,
          lockedAt: null,
          firstConfirmedAt: null,
        },
      });

      // Step 4: 记录审计日志（在意向删除之后）
      await createMarketLog(item.id, auth.userId, MarketLogActionType.ITEM_UNLOCKED, null, tx);

      // Step 5: 记录意向自动撤回审计日志（解锁时物理删除买家意向，允许其重新表达）
      if (formerBuyerId) {
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

    // Step 6: 通知买家（意向已重置，可重新表达）
    if (formerBuyerId) {
      await createNotification(
        formerBuyerId,
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

/**
 * 确认交易：卖家设 sellerConfirmed，买家设 buyerConfirmed；双方都确认后自动设为 COMPLETED
 */
export async function confirmTransaction(itemId: string): Promise<MarketActionResult> {
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

    const updates: {
      buyerConfirmed?: boolean;
      sellerConfirmed?: boolean;
      status?: MarketItemStatus;
      firstConfirmedAt?: Date;
    } = {};

    if (isSeller) {
      updates.sellerConfirmed = true;
    }
    if (isBuyer) {
      updates.buyerConfirmed = true;
    }

    const nextSellerConfirmed = isSeller ? true : item.sellerConfirmed;
    const nextBuyerConfirmed = isBuyer ? true : item.buyerConfirmed;

    const completed = nextSellerConfirmed && nextBuyerConfirmed;
    if (completed) {
      updates.status = MarketItemStatus.COMPLETED;
    }

    // 首次确认时记录 firstConfirmedAt（用于单方超时自动完成）
    const isFirstConfirmation = !item.buyerConfirmed && !item.sellerConfirmed;
    if (isFirstConfirmation) {
      updates.firstConfirmedAt = new Date();
    }

    await prisma.$transaction(async (tx) => {
      await tx.marketItem.update({
        where: { id: item.id },
        data: updates,
      });
      if (isSeller) {
        await createMarketLog(item.id, auth.userId, MarketLogActionType.SELLER_CONFIRMED, null, tx);
      }
      if (isBuyer) {
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
    });

    const otherUserId = isSeller ? item.selectedBuyerId : item.userId;
    if (otherUserId) {
      await createNotification(
        otherUserId,
        auth.userId,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        isSeller ? "卖家已确认交易完成" : "买家已确认交易完成"
      );
    }

    return { success: true, data: { completed } };
  } catch (err) {
    console.error("[confirmTransaction]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/**
 * 交易完成后评价（Thumb Up/Down）
 * 买家评价卖家 或 卖家评价买家，每人每笔交易只能评价一次
 */
export async function rateMarketTransaction(
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
        buyerRatingOfSeller: true,
        sellerRatingOfBuyer: true,
      },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.status !== MarketItemStatus.COMPLETED) {
      return { success: false, error: "仅已完成交易可评价" };
    }

    const isSeller = item.userId === auth.userId;
    const isBuyer = item.selectedBuyerId === auth.userId;

    if (!isSeller && !isBuyer) {
      return { success: false, error: "仅买卖双方可评价" };
    }

    if (isBuyer && item.buyerRatingOfSeller != null) {
      return { success: false, error: "您已评价过该交易" };
    }
    if (isSeller && item.sellerRatingOfBuyer != null) {
      return { success: false, error: "您已评价过该交易" };
    }

    await prisma.marketItem.update({
      where: { id: item.id },
      data: isBuyer
        ? { buyerRatingOfSeller: isPositive }
        : { sellerRatingOfBuyer: isPositive },
    });

    return { success: true };
  } catch (err) {
    console.error("[rateMarketTransaction]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "评价失败",
    };
  }
}

/**
 * 用户集市声誉（按角色：卖家 / 买家）
 * - 卖家声誉：基于 buyerRatingOfSeller（买家对卖家的评价）
 * - 买家声誉：基于 sellerRatingOfBuyer（卖家对买家的评价）
 */
export async function getUserReputation(
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

/**
 * 获取用户在集市交易中的好评率（作为卖家或买家收到的评价）
 * @returns { thumbsUp, total, rate } 好评数、总评价数、好评率(0-100)
 */
export async function getMarketThumbsUpRate(
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

    const sellerThumbsUp = asSeller.filter((i) => i.buyerRatingOfSeller === true).length;
    const buyerThumbsUp = asBuyer.filter((i) => i.sellerRatingOfBuyer === true).length;
    const total = asSeller.length + asBuyer.length;
    const thumbsUp = sellerThumbsUp + buyerThumbsUp;
    const rate = total > 0 ? Math.round((thumbsUp / total) * 100) : 0;

    return {
      success: true,
      data: { thumbsUp, total, rate },
    };
  } catch (err) {
    console.error("[getMarketThumbsUpRate]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取好评率失败",
    };
  }
}

/**
 * 举报商品（reportCount + 1）
 */
export async function reportMarketItem(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, schoolId: true, userId: true, reportCount: true, title: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (auth.schoolId !== null && auth.schoolId !== item.schoolId) {
      return { success: false, error: "无权举报该商品" };
    }

    const updated = await prisma.marketItem.update({
      where: { id: item.id },
      data: {
        reportCount: { increment: 1 },
        ...(item.reportCount + 1 >= 5 ? { isHidden: true } : {}),
      },
      select: { id: true, userId: true, reportCount: true, isHidden: true },
    });

    if (updated.isHidden && updated.userId) {
      await createNotification(
        updated.userId,
        null,
        NotificationType.SYSTEM,
        updated.id,
        NotificationEntityType.MARKET_ITEM,
        "您的生存集市商品因被举报次数过多已被自动隐藏，如有疑问请联系管理员。"
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

/**
 * 删除商品（软删除，仅本人或管理员）
 * 设置 status = DELETED
 * 通知所有有意向的用户，商品已下架
 */
export async function deleteMarketItem(itemId: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, userId: true, schoolId: true, title: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    const isOwner = item.userId === auth.userId;
    const isAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
    const sameSchool = auth.schoolId !== null && auth.schoolId === item.schoolId;

    if (!isOwner && !(isAdmin && sameSchool)) {
      return { success: false, error: "无权删除该商品" };
    }

    const intentions = await prisma.marketIntention.findMany({
      where: { itemId: item.id },
      select: { userId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.marketItem.update({
        where: { id: item.id },
        data: { status: MarketItemStatus.DELETED },
      });
      await createMarketLog(item.id, auth.userId, MarketLogActionType.ITEM_DELETED, null, tx);
    });

    const titlePreview =
      (item.title || "").length > 30
        ? `${(item.title || "").slice(0, 30)}…`
        : item.title || "";
    const deletedMessage = `您关注的商品「${titlePreview}」已被卖家下架`;

    for (const intention of intentions) {
      if (intention.userId !== auth.userId) {
        await createNotification(
          intention.userId,
          null,
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          deletedMessage
        );
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[deleteMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

/**
 * 校验管理员/工作人员权限（校管/工作人员/超管）
 */
async function requireAdminOrStaff(): Promise<
  { ok: true; auth: { userId: string; role?: string; schoolId?: string | null } } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  const isAdmin = auth.role === "ADMIN" || auth.role === "STAFF" || auth.role === "SUPER_ADMIN";
  if (!isAdmin) return { ok: false, error: "无权限" };
  return { ok: true, auth };
}

/** 管理员审计轨迹返回结构 */
export interface AdminItemAuditTrailResult {
  item: {
    id: string;
    title: string;
    status: string;
    category: { id: string; name: string } | null;
    seller: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  };
  history: Array<{
    timestamp: string;
    user: { avatar: string | null; nickname: string | null; email: string | null; role?: number };
    action: string;
    details: string | null;
  }>;
}

/** 审计日志动作类型 → 可读标签 */
const MARKET_LOG_ACTION_LABELS: Record<string, string> = {
  INTENTION_CREATED: "提交意向",
  INTENTION_WITHDRAWN: "撤回意向",
  ITEM_LOCKED: "锁定商品",
  ITEM_UNLOCKED: "解锁商品",
  INTENTION_RESET_BY_UNLOCK: "意向重置（解锁）",
  INTENTION_AUTO_WITHDRAWN_ON_UNLOCK: "意向自动撤回（解锁）",
  TRANSACTION_COMPLETED: "交易完成",
  BUYER_CONFIRMED: "买家确认",
  SELLER_CONFIRMED: "卖家确认",
  ITEM_EDITED: "编辑商品",
  ADMIN_HIDDEN: "管理员下架",
  ADMIN_RELISTED: "管理员重新上架",
  ITEM_DELETED: "删除商品",
  AUTO_UNLOCKED: "自动解锁",
  AUTO_COMPLETED: "自动完成",
};

function formatTimestamp(date: Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 生成集市商品审计报告（Markdown 格式）
 * 需管理员/工作人员权限，且商品须属于本校
 */
export async function generateMarketAuditReport(
  itemId: string
): Promise<MarketActionResult<string>> {
  try {
    const perm = await requireAdminOrStaff();
    if (!perm.ok) return { success: false, error: perm.error };
    if (perm.auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!perm.auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        schoolId: true,
        category: { select: { id: true, name: true } },
        user: { select: { id: true, nickname: true, email: true } },
        poi: { select: { id: true, name: true } },
      },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (perm.auth.schoolId !== item.schoolId) {
      return { success: false, error: "只能查看本校商品" };
    }

    const logs = await prisma.marketLog.findMany({
      where: { itemId: item.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
      },
    });

    const lines: string[] = [];

    lines.push("# Campus Survival Guide - Market Audit Report");
    lines.push("");
    lines.push("---");
    lines.push("");

    lines.push("## Item Info");
    lines.push("");
    lines.push(`- **Title**: ${item.title ?? "—"}`);
    lines.push(`- **ID**: ${item.id}`);
    lines.push(`- **Category**: ${item.category?.name ?? "—"}`);
    lines.push(`- **Price**: ${item.price != null ? `¥${item.price}` : "—"}`);
    lines.push(`- **Status**: ${item.status ?? "—"}`);
    lines.push(`- **Location**: ${item.poi?.name ?? "—"}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    lines.push("## Seller Info");
    lines.push("");
    lines.push(`- **Nickname**: ${item.user?.nickname ?? "—"}`);
    lines.push(`- **Email**: ${item.user?.email ?? "—"}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    lines.push("## Timeline");
    lines.push("");
    lines.push("*(Newest to Oldest)*");
    lines.push("");

    for (const log of logs) {
      const actorEmail =
        (log.user as { email: string | null } | null)?.email?.trim() || "已删除用户 / Unknown";
      const actionLabel =
        MARKET_LOG_ACTION_LABELS[log.actionType] ?? log.actionType;
      const details = log.details?.trim() ? ` - ${log.details}` : "";
      lines.push(
        `- \`[${formatTimestamp(log.createdAt)}]\` **[${actionLabel}]** By ${actorEmail}${details}`
      );
    }

    if (logs.length === 0) {
      lines.push("*No log entries.*");
    }

    lines.push("");

    return {
      success: true,
      data: lines.join("\n"),
    };
  } catch (err) {
    console.error("[generateMarketAuditReport]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "生成审计报告失败",
    };
  }
}

/**
 * 管理员获取集市商品完整审计轨迹（需管理员/工作人员权限，且商品须属于本校）
 */
export async function getAdminItemAuditTrail(
  itemId: string
): Promise<MarketActionResult<AdminItemAuditTrailResult>> {
  try {
    const perm = await requireAdminOrStaff();
    if (!perm.ok) return { success: false, error: perm.error };
    if (perm.auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!perm.auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: {
        id: true,
        title: true,
        status: true,
        schoolId: true,
        category: { select: { id: true, name: true } },
        user: {
          select: { id: true, nickname: true, avatar: true, email: true },
        },
      },
    });

    if (!item) return { success: false, error: "商品不存在" };

    if (perm.auth.schoolId !== item.schoolId) {
      return { success: false, error: "只能查看本校商品" };
    }

    const logs = await prisma.marketLog.findMany({
      where: { itemId: item.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { avatar: true, nickname: true, email: true, role: true } },
      },
    });

    return {
      success: true,
      data: {
        item: {
          id: item.id,
          title: item.title,
          status: item.status,
          category: item.category ? { id: item.category.id, name: item.category.name } : null,
          seller: {
            id: item.user.id,
            nickname: item.user.nickname,
            avatar: item.user.avatar,
            email: item.user.email,
          },
        },
        history: logs.map((log) => {
          const u = log.user as { avatar: string | null; nickname: string | null; email: string | null; role: number };
          return {
            timestamp: log.createdAt.toISOString(),
            user: {
              avatar: u.avatar,
              nickname: u.nickname,
              email: u.email,
              role: u.role,
            },
            action: log.actionType,
            details: log.details,
          };
        }),
      },
    };
  } catch (err) {
    console.error("[getAdminItemAuditTrail]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取审计轨迹失败",
    };
  }
}

/**
 * 管理员操作集市商品：下架 / 彻底删除 / 重新上架
 * - delete: ACTIVE/LOCKED → 下架（isHidden）；isHidden/COMPLETED/EXPIRED/DELETED → 彻底删除
 * - relist: 仅 isHidden（管理员下架）可重新上架；禁止 COMPLETED/DELETED/已过期
 */
export async function adminMarketItemAction(
  itemId: string,
  action: "delete" | "relist"
): Promise<MarketActionResult<{ message: string }>> {
  try {
    const perm = await requireAdminOrStaff();
    if (!perm.ok) return { success: false, error: perm.error };
    if (perm.auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!perm.auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, schoolId: true, status: true, isHidden: true, expiresAt: true },
    });

    if (!item) return { success: false, error: "商品不存在" };

    if (perm.auth.schoolId !== item.schoolId) {
      return { success: false, error: "只能操作本校商品" };
    }

    const now = new Date();
    const isExpired = item.expiresAt < now;

    if (action === "delete") {
      // 优先判断彻底删除：isHidden / COMPLETED / DELETED / 已过期 → 物理删除
      const canHardDelete =
        item.isHidden ||
        item.status === MarketItemStatus.COMPLETED ||
        item.status === MarketItemStatus.DELETED ||
        (item.status === MarketItemStatus.ACTIVE && isExpired) ||
        (item.status === MarketItemStatus.LOCKED && isExpired);

      if (canHardDelete) {
        await prisma.$transaction(async (tx) => {
          await createMarketLog(
            item.id,
            perm.auth.userId,
            MarketLogActionType.ITEM_DELETED,
            "管理员彻底删除",
            tx
          );
          // 先删除关联记录，避免 FK 约束问题（MarketIntention 需手动删除；MarketLog 有 onDelete: SetNull）
          await tx.marketIntention.deleteMany({ where: { itemId: item.id } });
          await tx.marketItem.delete({ where: { id: item.id } });
        });
        return { success: true, data: { message: "已彻底删除" } };
      }

      // ACTIVE 或 LOCKED 且未下架且未过期 → 下架（isHidden）
      if (item.status === MarketItemStatus.ACTIVE || item.status === MarketItemStatus.LOCKED) {
        await prisma.$transaction(async (tx) => {
          await tx.marketItem.update({
            where: { id: item.id },
            data: { isHidden: true },
          });
          await createMarketLog(
            item.id,
            perm.auth.userId,
            MarketLogActionType.ADMIN_HIDDEN,
            null,
            tx
          );
        });
        return { success: true, data: { message: "已下架" } };
      }

      return { success: false, error: "当前状态不支持删除操作" };
    }

    if (action === "relist") {
      if (item.status === MarketItemStatus.COMPLETED || item.status === MarketItemStatus.DELETED) {
        return { success: false, error: "已完成或已删除的商品不可重新上架" };
      }
      if (item.status === MarketItemStatus.ACTIVE && isExpired) {
        return { success: false, error: "已过期的商品不可重新上架" };
      }
      if (!item.isHidden) {
        return { success: false, error: "仅可重新上架已被管理员下架的商品" };
      }
      await prisma.$transaction(async (tx) => {
        await tx.marketItem.update({
          where: { id: item.id },
          data: {
            isHidden: false,
            ...(item.status === MarketItemStatus.LOCKED
              ? {
                  status: MarketItemStatus.ACTIVE,
                  selectedBuyerId: null,
                  buyerConfirmed: false,
                  sellerConfirmed: false,
                  lockedAt: null,
                }
              : {}),
          },
        });
        await createMarketLog(item.id, perm.auth.userId, MarketLogActionType.ADMIN_RELISTED, null, tx);
      });
      return { success: true, data: { message: "已重新上架" } };
    }

    return { success: false, error: "无效操作" };
  } catch (err) {
    console.error("[adminMarketItemAction]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}
