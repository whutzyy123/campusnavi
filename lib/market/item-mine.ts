"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { deniedBySchoolTenant } from "@/lib/school/scope";
import { validateContent } from "@/lib/content/validator";
import { MarketItemStatus, MarketLogActionType, NotificationType, NotificationEntityType } from "@prisma/client";
import { createMarketLog, createNotification } from "./shared";
import type {
  MarketActionResult,
  CreateMarketItemDTO,
  MarketItemResult,
  MyMarketItemsResult,
  MyMarketItemEntry,
} from "./types";
import { safeImages } from "./types";
import { processMarketDeadlocks } from "./deadlock";

export { getMyMarketItems, createMarketItem, updateMarketItem, deleteMarketItem };

const EXPIRY_DAYS = 7;
const MAX_IMAGES = 9;

const UpdateMarketItemPayloadSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(2000).optional(),
  price: z.number().min(0).nullable().optional(),
  images: z.array(z.string()).max(MAX_IMAGES).optional(),
  categoryId: z.string().nullable().optional(),
  poiId: z.string().min(1).optional(),
  contact: z.string().max(100).nullable().optional(),
});

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
  userId: true,
  category: { select: { id: true, name: true } },
  transactionType: { select: { id: true, name: true, code: true } },
  poi: { select: { id: true, name: true } },
} as const;

function formatMarketItemForList(
  item: Record<string, unknown>,
  role: "seller" | "buyer",
  extra?: Record<string, unknown>
): MyMarketItemEntry {
  return {
    id: item.id as string,
    title: item.title as string,
    price: item.price as number | null,
    images: safeImages(item.images),
    status: item.status as string,
    selectedBuyerId: item.selectedBuyerId as string | null,
    buyerConfirmed: item.buyerConfirmed as boolean,
    sellerConfirmed: item.sellerConfirmed as boolean,
    lockedAt: item.lockedAt ? (item.lockedAt as Date).toISOString() : null,
    expiresAt: (item.expiresAt as Date).toISOString(),
    createdAt: (item.createdAt as Date).toISOString(),
    // Prisma 字段名是 selectedBuyerId，返回结构继续兼容 buyerId
    buyerId: item.selectedBuyerId as string | null,
    buyer: item.buyer as { id: string; nickname: string | null } | null,
    seller: item.seller as { id: string; nickname: string | null } | null,
    poi: item.poi as { id: string; name: string },
    category: item.category as { id: string; name: string } | null,
    transactionType: item.transactionType as { id: number; name: string; code: string },
    ...extra,
  } as MyMarketItemEntry;
}

/** 获取当前用户的集市活动 */
async function getMyMarketItems(): Promise<MarketActionResult<MyMarketItemsResult>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    await processMarketDeadlocks();

    const uid = auth.userId;

    const [sellingItems, intentions, buyingItemsRaw] = await Promise.all([
      prisma.marketItem.findMany({
        where: { userId: uid },
        select: MARKET_ITEM_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      prisma.marketIntention.findMany({
        where: { userId: uid },
        select: { itemId: true },
      }),
      prisma.marketItem.findMany({
        where: {
          status: { not: MarketItemStatus.HIDDEN }, // 排除已下架商品
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
        selling: sellingItems.map((i) => formatMarketItemForList(i as unknown as Record<string, unknown>, "seller")),
        buying: buyingItemsRaw.map((i) =>
          formatMarketItemForList(i as unknown as Record<string, unknown>, "buyer", { hasIntention: intentionItemIds.has(i.id) })
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

/** 创建集市商品 */
async function createMarketItem(
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

    const transactionType = await prisma.marketTransactionType.findFirst({
      where: { id: typeId, isActive: true },
      select: { id: true, code: true },
    });
    if (!transactionType) {
      return { success: false, error: "交易类型不存在或已停用" };
    }

    if (transactionType.code === "SALE") {
      if (price == null || typeof price !== "number" || price < 0) {
        return { success: false, error: "二手交易需填写有效价格" };
      }
    }

    const imagesArr = Array.isArray(images) ? images.filter((u): u is string => typeof u === "string") : [];
    if (imagesArr.length > MAX_IMAGES) {
      return { success: false, error: `图片最多 ${MAX_IMAGES} 张` };
    }

    let sanitizedTitle: string;
    try {
      sanitizedTitle = (await validateContent(title.trim(), { maskNumbers: true })).trim();
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    let sanitizedDescription: string;
    try {
      sanitizedDescription = (await validateContent(description.trim(), { maskNumbers: true })).trim();
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

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

    const poi = await prisma.pOI.findFirst({
      where: { id: poiId.trim() },
      select: { id: true, schoolId: true },
    });

    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    if (deniedBySchoolTenant(auth, poi.schoolId)) {
      return { success: false, error: "无权在该 POI 发布商品" };
    }

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

    revalidatePath("/center/market");

    return {
      success: true,
      data: {
        id: item.id,
        poiId: item.poiId,
        categoryId: item.categoryId,
        typeId: item.typeId,
        title: item.title,
        description: item.description,
        contact: item.contact,
        price: item.price,
        images: safeImages(item.images),
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
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

/** 更新集市商品 */
async function updateMarketItem(
  id: string,
  payload: z.infer<typeof UpdateMarketItemPayloadSchema>
): Promise<MarketActionResult<MarketItemResult>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录后再操作" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: id.trim() },
      select: { id: true, userId: true, schoolId: true },
    });

    if (!item) {
      return { success: false, error: "商品不存在" };
    }

    if (item.userId !== auth.userId) {
      return { success: false, error: "无权修改他人发布的商品" };
    }

    const parsed = UpdateMarketItemPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "参数错误" };
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) {
      try {
        updates.title = (await validateContent(data.title.trim(), { maskNumbers: true })).trim();
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "标题包含敏感词汇，请修改后重试。",
        };
      }
    }

    if (data.description !== undefined) {
      try {
        updates.description = (await validateContent(data.description.trim(), { maskNumbers: true })).trim();
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "描述包含敏感词汇，请修改后重试。",
        };
      }
    }

    if (data.price !== undefined) updates.price = data.price;
    if (data.images !== undefined) {
      const arr = Array.isArray(data.images) ? data.images.filter((u): u is string => typeof u === "string") : [];
      if (arr.length > MAX_IMAGES) {
        return { success: false, error: `图片最多 ${MAX_IMAGES} 张` };
      }
      updates.images = arr;
    }
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId?.trim() || null;
    if (data.poiId !== undefined) updates.poiId = data.poiId?.trim();
    if (data.contact !== undefined) {
      const contact = data.contact?.trim();
      if (contact && contact.length > 0) {
        try {
          await validateContent(contact, { maskNumbers: false });
        } catch (e) {
          return {
            success: false,
            error: e instanceof Error ? e.message : "联系方式包含敏感词汇，请修改后重试。",
          };
        }
      }
      updates.contact = contact || null;
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, error: "没有需要更新的字段" };
    }

    const updated = await prisma.marketItem.update({
      where: { id: id.trim() },
      data: updates,
    });

    await createMarketLog(id.trim(), auth.userId, MarketLogActionType.ITEM_EDITED, null);

    revalidatePath("/center/market");

    return {
      success: true,
      data: {
        id: updated.id,
        poiId: updated.poiId,
        categoryId: updated.categoryId,
        typeId: updated.typeId,
        title: updated.title,
        description: updated.description,
        contact: updated.contact,
        price: updated.price,
        images: safeImages(updated.images),
        status: updated.status,
        reportCount: updated.reportCount,
        expiresAt: updated.expiresAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
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

/** 删除商品（软删除） */
async function deleteMarketItem(itemId: string): Promise<MarketActionResult> {
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
    const isSchoolModerator =
      auth.role === "ADMIN" || auth.role === "STAFF"
        ? auth.schoolId !== null && auth.schoolId === item.schoolId
        : false;
    const isSuperAdmin = auth.role === "SUPER_ADMIN";

    if (!isOwner && !isSuperAdmin && !isSchoolModerator) {
      return { success: false, error: "无权删除该商品" };
    }

    const intentions = await prisma.marketIntention.findMany({
      where: { itemId: item.id },
      select: { userId: true },
    });

    await prisma.marketItem.update({
      where: { id: item.id },
      data: { status: MarketItemStatus.DELETED },
    });

    await createMarketLog(item.id, auth.userId, MarketLogActionType.ITEM_DELETED, null);

    for (const intention of intentions) {
      await createNotification(
        intention.userId,
        auth.userId,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        `您有意向的商品「${(item.title || "").slice(0, 30)}」已下架`
      );
    }

    revalidatePath("/center/market");

    return { success: true };
  } catch (err) {
    console.error("[deleteMarketItem]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}
