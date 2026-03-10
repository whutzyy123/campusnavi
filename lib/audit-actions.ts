"use server";

/**
 * 举报审核 Server Actions
 * 校级管理员/工作人员专用（超管不参与）
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notification-actions";
import { NotificationType, NotificationEntityType } from "@prisma/client";

export type AuditActionResult<T = unknown> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

async function requireSchoolAdmin(schoolId: string): Promise<
  { ok: true; auth: { userId: string; schoolId: string | null } } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  if (auth.role === "SUPER_ADMIN") {
    return { ok: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
  }
  if (auth.role !== "ADMIN" && auth.role !== "STAFF") {
    return { ok: false, error: "无权限" };
  }
  if (!auth.schoolId || auth.schoolId !== schoolId) {
    return { ok: false, error: "只能查看本校数据" };
  }
  return { ok: true, auth: { userId: auth.userId, schoolId: auth.schoolId } };
}

/** 被举报 POI 项 */
export interface ReportedPOIItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  lat: number;
  lng: number;
  reportCount: number;
  isOfficial: boolean;
  schoolId: string;
  schoolName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 获取被举报的 POI 列表
 */
export async function getAuditReports(
  schoolId: string,
  minReportCount: number = 1
): Promise<AuditActionResult<ReportedPOIItem[]>> {
  try {
    const perm = await requireSchoolAdmin(schoolId);
    if (!perm.ok) return { success: false, error: perm.error };

    const pois = await prisma.pOI.findMany({
      where: {
        schoolId: schoolId.trim(),
        reportCount: { gte: minReportCount },
      },
      include: {
        school: { select: { id: true, name: true } },
      },
      orderBy: { reportCount: "desc" },
    });

    return {
      success: true,
      data: pois.map((poi) => ({
        id: poi.id,
        name: poi.name,
        category: poi.category,
        description: poi.description,
        lat: poi.lat,
        lng: poi.lng,
        reportCount: poi.reportCount,
        isOfficial: poi.isOfficial,
        schoolId: poi.schoolId,
        schoolName: poi.school.name,
        createdAt: poi.createdAt.toISOString(),
        updatedAt: poi.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("getAuditReports 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取举报列表失败",
    };
  }
}

/** 被举报集市商品项 */
export interface ReportedMarketItemEntry {
  id: string;
  title: string;
  description: string;
  typeId: number;
  transactionType: { id: number; name: string; code: string } | null;
  status: string;
  reportCount: number;
  isHidden: boolean;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null; email: string | null };
  category: { id: string; name: string } | null;
  poi: { id: string; name: string } | null;
  images: string[];
  price: number | null;
}

/**
 * 获取被举报或已隐藏的生存集市商品
 */
export async function getAuditMarketItems(
  schoolId: string,
  minReportCount: number = 1
): Promise<AuditActionResult<ReportedMarketItemEntry[]>> {
  try {
    const perm = await requireSchoolAdmin(schoolId);
    if (!perm.ok) return { success: false, error: perm.error };

    const items = await prisma.marketItem.findMany({
      where: {
        schoolId: schoolId.trim(),
        OR: [
          { reportCount: { gte: minReportCount } },
          { isHidden: true },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        typeId: true,
        status: true,
        reportCount: true,
        isHidden: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { id: true, nickname: true, email: true } },
        category: { select: { id: true, name: true } },
        poi: { select: { id: true, name: true } },
        images: true,
        price: true,
        transactionType: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
    });

    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        typeId: item.typeId,
        transactionType: item.transactionType,
        status: item.status,
        reportCount: item.reportCount,
        isHidden: item.isHidden,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        user: item.user,
        category: item.category,
        poi: item.poi,
        images: (item.images as string[]) ?? [],
        price: item.price,
      })),
    };
  } catch (err) {
    console.error("getAuditMarketItems 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取集市举报列表失败",
    };
  }
}

/**
 * 处理 POI 举报
 */
export async function resolveAudit(
  poiId: string,
  action: "ignore" | "delete"
): Promise<AuditActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) return { success: false, error: "请先登录" };
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核" };
    }
    if (auth.role !== "ADMIN" && auth.role !== "STAFF") {
      return { success: false, error: "无权限" };
    }

    if (!["ignore", "delete"].includes(action)) {
      return { success: false, error: "无效的操作类型，必须是 ignore 或 delete" };
    }

    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: { id: true, schoolId: true },
    });

    if (!poi) return { success: false, error: "POI 不存在" };
    if (!auth.schoolId || auth.schoolId !== poi.schoolId) {
      return { success: false, error: "只能处理本校 POI" };
    }

    if (action === "ignore") {
      await prisma.pOI.update({
        where: { id: poiId },
        data: { reportCount: 0 },
      });
      return { success: true, message: "已忽略举报，POI 已恢复显示" };
    }

    await prisma.pOI.delete({ where: { id: poiId } });
    return { success: true, message: "POI 已永久删除" };
  } catch (err) {
    console.error("resolveAudit 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "处理失败",
    };
  }
}

/**
 * 处理生存集市举报
 */
export async function resolveMarketAudit(
  itemId: string,
  action: "pass" | "delete"
): Promise<AuditActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) return { success: false, error: "请先登录" };
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核" };
    }
    if (auth.role !== "ADMIN" && auth.role !== "STAFF") {
      return { success: false, error: "无权限" };
    }

    if (!["pass", "delete"].includes(action)) {
      return { success: false, error: "action 必须是 pass 或 delete" };
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, schoolId: true, userId: true, title: true },
    });

    if (!item) return { success: false, error: "商品不存在" };
    if (!auth.schoolId || auth.schoolId !== item.schoolId) {
      return { success: false, error: "只能处理本校商品" };
    }

    if (action === "pass") {
      await prisma.marketItem.update({
        where: { id: item.id },
        data: { reportCount: 0, isHidden: false },
      });
      return { success: true, message: "已通过审核，商品已恢复显示" };
    }

    await prisma.marketItem.delete({ where: { id: item.id } });
    if (item.userId) {
      await createNotification(
        item.userId,
        null,
        NotificationType.SYSTEM,
        item.id,
        NotificationEntityType.MARKET_ITEM,
        `您的生存集市商品「${(item.title || "").slice(0, 30)}」已被管理员删除。如有疑问请联系管理员。`
      );
    }
    return { success: true, message: "商品已删除" };
  } catch (err) {
    console.error("resolveMarketAudit 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "处理失败",
    };
  }
}
