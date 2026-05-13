"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { MarketItemStatus, NotificationType, NotificationEntityType } from "@prisma/client";
import { createMarketLog, requireAdminOrStaff, createNotification } from "./shared";
import type { MarketActionResult, AdminItemAuditTrailResult, AdminMarketItemRow, AdminMarketCategoriesConfig } from "./types";
import { safeImages } from "./types";
import { MarketLogActionType, MARKET_LOG_ACTION_LABELS } from "./constants";

export {
  generateMarketAuditReport,
  getAdminItemAuditTrail,
  adminMarketItemAction,
  getAdminMarketItems,
  getAdminMarketCategoriesConfig,
};

function formatTimestamp(date: Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 生成集市商品审计报告（Markdown 格式） */
async function generateMarketAuditReport(
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

/** 管理员获取集市商品完整审计轨迹 */
async function getAdminItemAuditTrail(
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

/** 管理员操作集市商品：下架 / 彻底删除 / 重新上架 */
async function adminMarketItemAction(
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
      select: { id: true, schoolId: true, status: true, expiresAt: true },
    });

    if (!item) return { success: false, error: "商品不存在" };

    if (perm.auth.schoolId !== item.schoolId) {
      return { success: false, error: "只能操作本校商品" };
    }

    const now = new Date();
    const isExpired = item.expiresAt < now;

    if (action === "delete") {
      // 可以彻底删除的条件：已下架(HIDDEN)、已完成(COMPLETED)、已删除(DELETED)，或已过期且在架/锁定
      const canHardDelete =
        item.status === MarketItemStatus.HIDDEN ||
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
          await tx.marketIntention.deleteMany({ where: { itemId: item.id } });
          await tx.marketItem.delete({ where: { id: item.id } });
        });
        return { success: true, data: { message: "已彻底删除" } };
      }

      // 下架：将状态改为 HIDDEN
      if (item.status === MarketItemStatus.ACTIVE || item.status === MarketItemStatus.LOCKED) {
        await prisma.$transaction(async (tx) => {
          await tx.marketItem.update({
            where: { id: item.id },
            data: { status: MarketItemStatus.HIDDEN },
          });
          await createMarketLog(item.id, perm.auth.userId, MarketLogActionType.ADMIN_HIDDEN, null, tx);
        });
        return { success: true, data: { message: "已下架" } };
      }

      return { success: false, error: "当前状态不支持此操作" };
    }

    if (action === "relist") {
      if (item.status !== MarketItemStatus.HIDDEN) {
        return { success: false, error: "只有已下架的商品可以重新上架" };
      }
      if (isExpired) {
        return { success: false, error: "已过期的商品无法重新上架" };
      }

      await prisma.$transaction(async (tx) => {
        await tx.marketItem.update({
          where: { id: item.id },
          data: { status: MarketItemStatus.ACTIVE },
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

/** 校级管理员获取本校生存集市商品列表 */
async function getAdminMarketItems(
  schoolId?: string,
  params?: {
    search?: string;
    categoryId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
): Promise<MarketActionResult<{ data: AdminMarketItemRow[]; pagination: { total: number; pageCount: number; currentPage: number; limit: number } }>> {
  try {
    const perm = await requireAdminOrStaff();
    if (!perm.ok) return { success: false, error: perm.error };
    if (perm.auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校管控制台" };
    }
    if (!perm.auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const requestedSchoolId = schoolId?.trim();
    if (requestedSchoolId && requestedSchoolId !== perm.auth.schoolId) {
      return { success: false, error: "无权查看其他学校数据" };
    }
    const targetSchoolId = perm.auth.schoolId;
    const { search, categoryId, status, page = 1, limit = 20 } = params || {};
    const pageNum = Math.max(1, Number(page));
    const pageSizeNum = Math.min(100, Math.max(1, Number(limit)));

    const where: Record<string, unknown> = { schoolId: targetSchoolId };
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (categoryId?.trim()) {
      where.categoryId = categoryId.trim();
    }
    if (search?.trim()) {
      where.OR = [
        { title: { contains: search.trim() } },
        { user: { nickname: { contains: search.trim() } } },
        { user: { email: { contains: search.trim() } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.marketItem.count({ where }),
      prisma.marketItem.findMany({
        where,
        select: {
          id: true,
          title: true,
          typeId: true,
          status: true,
          reportCount: true,
          expiresAt: true,
          createdAt: true,
          images: true,
          price: true,
          selectedBuyerId: true,
          user: { select: { id: true, nickname: true, email: true } },
          selectedBuyer: { select: { id: true, nickname: true, email: true } },
          category: { select: { id: true, name: true } },
          poi: { select: { id: true, name: true } },
          transactionType: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
    ]);

    const data: AdminMarketItemRow[] = items.map((item) => ({
      id: item.id,
      title: item.title,
      typeId: item.typeId,
      transactionType: item.transactionType,
      status: item.status,
      reportCount: item.reportCount,
      expiresAt: item.expiresAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
      user: item.user,
      buyer: item.selectedBuyer,
      buyerId: item.selectedBuyerId,
      category: item.category,
      poi: item.poi,
      images: safeImages(item.images),
      price: item.price,
    }));

    return {
      success: true,
      data: {
        data,
        pagination: {
          total,
          pageCount: Math.ceil(total / pageSizeNum),
          currentPage: pageNum,
          limit: pageSizeNum,
        },
      },
    };
  } catch (err) {
    console.error("getAdminMarketItems 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "服务器错误",
    };
  }
}

/** 获取物品分类池 + 各交易类型的关联状态（仅超级管理员） */
async function getAdminMarketCategoriesConfig(): Promise<{
  success: boolean;
  data?: AdminMarketCategoriesConfig;
  error?: string;
}> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可访问" };
    }

    const [categories, links, transactionTypes] = await Promise.all([
      prisma.marketCategory.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          order: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { marketItems: true } },
        },
      }),
      prisma.marketTypeCategory.findMany({
        select: { transactionTypeId: true, categoryId: true },
      }),
      prisma.marketTransactionType.findMany({
        orderBy: { order: "asc" },
        select: { id: true, name: true, code: true, order: true, isActive: true },
      }),
    ]);

    const typeLinks: Record<string, number[]> = {};
    for (const link of links) {
      if (!typeLinks[link.categoryId]) typeLinks[link.categoryId] = [];
      typeLinks[link.categoryId].push(link.transactionTypeId);
    }

    const data: AdminMarketCategoriesConfig = {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        isActive: c.isActive,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        _count: c._count ?? { marketItems: 0 },
      })),
      typeLinks,
      transactionTypes,
    };

    return { success: true, data };
  } catch (err) {
    console.error("getAdminMarketCategoriesConfig 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "未知错误",
    };
  }
}
