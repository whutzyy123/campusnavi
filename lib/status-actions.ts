"use server";

/**
 * Live Status (Ephemeral Tags) Server Actions
 * 实时状态上报与查询，严格遵循 schoolId 多租户隔离
 */

import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

/** 人流状况（EMPTY/BUSY/CROWDED）有效期：20 分钟 */
const TRAFFIC_EXPIRY_MINUTES = 20;
/** 事件/状态（CONSTRUCTION/CLOSED）有效期：8 小时 */
const EVENTS_EXPIRY_HOURS = 8;

const TRAFFIC_STATUS_TYPES = ["EMPTY", "BUSY", "CROWDED"] as const;

function getExpiresAt(statusType: string): Date {
  const expiresAt = new Date();
  if (TRAFFIC_STATUS_TYPES.includes(statusType as (typeof TRAFFIC_STATUS_TYPES)[number])) {
    expiresAt.setMinutes(expiresAt.getMinutes() + TRAFFIC_EXPIRY_MINUTES);
  } else {
    expiresAt.setHours(expiresAt.getHours() + EVENTS_EXPIRY_HOURS);
  }
  return expiresAt;
}

export interface StatusActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 上报 POI 实时状态
 * - 需登录
 * - 验证 POI 存在且用户有权限（同校或超级管理员）
 * - 人流状况（EMPTY/BUSY/CROWDED）有效期 20 分钟；事件/状态（CONSTRUCTION/CLOSED）有效期 8 小时
 */
export async function reportLiveStatus(
  poiId: string,
  statusType: string,
  description?: string | null
): Promise<StatusActionResult<{ id: string; expiresAt: string }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "请先登录后再上报状态" };
    }

    if (!poiId?.trim() || !statusType?.trim()) {
      return { success: false, error: "poiId 和 statusType 为必填项" };
    }

    // 获取 POI 并验证存在
    const poi = await prisma.pOI.findFirst({
      where: { id: poiId.trim() },
      select: { id: true, schoolId: true },
    });

    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    // 多租户校验：用户必须有权限上报该校区的 POI
    if (auth.schoolId !== null && auth.schoolId !== poi.schoolId) {
      return { success: false, error: "无权对该 POI 上报状态" };
    }

    const expiresAt = getExpiresAt(statusType.trim());

    const liveStatus = await prisma.liveStatus.create({
      data: {
        poiId: poi.id,
        schoolId: poi.schoolId,
        userId: auth.userId,
        statusType: statusType.trim(),
        description: description?.trim() || null,
        expiresAt,
      },
    });

    return {
      success: true,
      data: {
        id: liveStatus.id,
        expiresAt: liveStatus.expiresAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[reportLiveStatus]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "上报状态失败",
    };
  }
}

/**
 * 按学校获取当前有效状态（用于地图展示）
 * 仅返回 expiresAt > now 且 schoolId 匹配的记录
 */
export async function getActiveStatusesBySchool(
  schoolId: string
): Promise<StatusActionResult<Array<{ id: string; poiId: string; statusType: string; createdAt: string }>>> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "schoolId 为必填项" };
    }

    const now = new Date();
    const statuses = await prisma.liveStatus.findMany({
      where: {
        schoolId: schoolId.trim(),
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        poiId: true,
        statusType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: statuses.map((s) => ({
        id: s.id,
        poiId: s.poiId,
        statusType: s.statusType,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[getActiveStatusesBySchool]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取状态列表失败",
    };
  }
}

/**
 * 按 POI 获取当前有效状态（用于 POI 抽屉展示）
 * 严格按 schoolId + poiId 过滤，确保多租户隔离
 */
export async function getActiveStatusesByPoi(
  poiId: string,
  schoolId: string
): Promise<
  StatusActionResult<
    Array<{
      id: string;
      statusType: string;
      description: string | null;
      upvotes: number;
      createdAt: string;
    }>
  >
> {
  try {
    if (!poiId?.trim() || !schoolId?.trim()) {
      return { success: false, error: "poiId 和 schoolId 为必填项" };
    }

    const now = new Date();
    const statuses = await prisma.liveStatus.findMany({
      where: {
        poiId: poiId.trim(),
        schoolId: schoolId.trim(),
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        statusType: true,
        description: true,
        upvotes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: statuses.map((s) => ({
        id: s.id,
        statusType: s.statusType,
        description: s.description,
        upvotes: s.upvotes,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[getActiveStatusesByPoi]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取 POI 状态失败",
    };
  }
}
