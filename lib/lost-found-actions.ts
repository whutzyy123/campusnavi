"use server";

/**
 * Lost & Found (失物招领) Server Actions
 * R16: 失物招领发布、查询、标记已找到
 */

import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { validateContent } from "@/lib/content-validator";
import { createNotification } from "@/lib/notification-actions";
import { LostFoundStatus, NotificationType, NotificationEntityType } from "@prisma/client";

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 小时
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 小时内同 POI 限发一条
const MAX_IMAGES = 3;

export interface LostFoundActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateLostFoundDTO {
  poiId: string;
  description: string;
  images: string[];
  contactInfo?: string | null;
}

export interface LostFoundEventItem {
  id: string;
  poiId: string;
  description: string;
  images: string[];
  contactInfo: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  user: {
    id: string;
    nickname: string | null;
  };
}

/**
 * 创建失物招领
 * - 需登录
 * - expiresAt 由后端自动计算（24 小时），不接受客户端传入
 * - 同 POI 1 小时内限发一条
 * - description 通过 validateContent 校验
 * - images 最多 3 张
 */
export async function createLostFoundEvent(
  data: CreateLostFoundDTO
): Promise<LostFoundActionResult<LostFoundEventItem>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录后再发布" };
    }

    const { poiId, description, images, contactInfo } = data;

    if (!poiId?.trim() || !description?.trim()) {
      return { success: false, error: "poiId 和 description 为必填项" };
    }

    if (description.trim().length > 500) {
      return { success: false, error: "描述最多 500 字" };
    }

    const imagesArr = Array.isArray(images) ? images.filter((u): u is string => typeof u === "string") : [];
    if (imagesArr.length > MAX_IMAGES) {
      return { success: false, error: `图片最多 ${MAX_IMAGES} 张` };
    }

    if (contactInfo != null && contactInfo.trim().length > 100) {
      return { success: false, error: "联系方式最多 100 字" };
    }

    // 联系方式：仅敏感词校验，不屏蔽数字（用户需保留 QQ/手机号等）
    if (contactInfo != null && contactInfo.trim().length > 0) {
      try {
        await validateContent(contactInfo.trim(), { checkNumbers: false });
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }

    // 描述：敏感词校验 + 数字序列屏蔽
    let sanitizedDescription: string;
    try {
      sanitizedDescription = (await validateContent(description.trim(), { checkNumbers: true })).trim();
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    // 校验 POI 存在且用户有权限（同校或超级管理员）
    const poi = await prisma.pOI.findFirst({
      where: { id: poiId.trim() },
      select: { id: true, schoolId: true },
    });

    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.schoolId !== null &&
      auth.schoolId !== poi.schoolId
    ) {
      return { success: false, error: "无权在该 POI 发布失物招领" };
    }

    // 限流：同一用户在同一 POI 1 小时内只能发一条
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_MS);
    const recentPost = await prisma.lostFoundEvent.findFirst({
      where: {
        userId: auth.userId,
        poiId: poi.id,
        createdAt: { gte: oneHourAgo },
      },
      select: { id: true },
    });

    if (recentPost) {
      return { success: false, error: "您在此位置发布过于频繁，请稍后再试。" };
    }

    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_MS);

    const event = await prisma.lostFoundEvent.create({
      data: {
        schoolId: poi.schoolId,
        poiId: poi.id,
        userId: auth.userId,
        description: sanitizedDescription,
        images: imagesArr,
        contactInfo: contactInfo?.trim() || null,
        status: LostFoundStatus.ACTIVE,
        expiresAt,
      },
      include: {
        user: { select: { id: true, nickname: true } },
      },
    });

    return {
      success: true,
      data: {
        id: event.id,
        poiId: event.poiId,
        description: event.description,
        images: (event.images as string[]) ?? [],
        contactInfo: event.contactInfo,
        status: event.status,
        expiresAt: event.expiresAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
        user: {
          id: event.user.id,
          nickname: event.user.nickname,
        },
      },
    };
  } catch (err) {
    console.error("[createLostFoundEvent]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "发布失败",
    };
  }
}

/**
 * 按 POI 获取当前有效失物招领（C 端展示）
 * 仅返回 status === ACTIVE 且 expiresAt > now 的记录，按 createdAt 倒序
 */
export async function getActiveLostFoundByPoi(
  poiId: string,
  schoolId: string
): Promise<
  LostFoundActionResult<
    Array<{
      id: string;
      description: string;
      images: string[];
      contactInfo: string | null;
      expiresAt: string;
      createdAt: string;
      user: { id: string; nickname: string | null };
    }>
  >
> {
  try {
    if (!poiId?.trim() || !schoolId?.trim()) {
      return { success: false, error: "poiId 和 schoolId 为必填项" };
    }

    const now = new Date();
    const events = await prisma.lostFoundEvent.findMany({
      where: {
        poiId: poiId.trim(),
        schoolId: schoolId.trim(),
        status: LostFoundStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        description: true,
        images: true,
        contactInfo: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: events.map((e) => ({
        id: e.id,
        description: e.description,
        images: (e.images as string[]) ?? [],
        contactInfo: e.contactInfo,
        expiresAt: e.expiresAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
        user: { id: e.user.id, nickname: e.user.nickname },
      })),
    };
  } catch (err) {
    console.error("[getActiveLostFoundByPoi]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取失物招领列表失败",
    };
  }
}

/**
 * 获取当前用户发布的失物招领列表（中控台「我的失物招领」）
 * - 按 createdAt 倒序（最新在前）
 * - 包含关联 POI 的 id 和 name，便于跳转
 */
export async function getUserLostFoundEvents(
  userId: string
): Promise<
  LostFoundActionResult<
    Array<{
      id: string;
      poiId: string;
      description: string;
      images: string[];
      contactInfo: string | null;
      status: string;
      expiresAt: string;
      createdAt: string;
      poi: { id: string; name: string };
    }>
  >
> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "userId 为必填项" };
    }

    const events = await prisma.lostFoundEvent.findMany({
      where: { userId: userId.trim() },
      include: {
        poi: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: events.map((e) => ({
        id: e.id,
        poiId: e.poiId,
        description: e.description,
        images: (e.images as string[]) ?? [],
        contactInfo: e.contactInfo,
        status: e.status,
        expiresAt: e.expiresAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
        poi: { id: e.poi.id, name: e.poi.name },
      })),
    };
  } catch (err) {
    console.error("[getUserLostFoundEvents]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取我的失物招领列表失败",
    };
  }
}

/**
 * 获取学校所有失物招领列表（失物招领页面筛选用）
 * - 按 createdAt 倒序（最新在前）
 * - 包含 userId 用于区分"我发布的"和"别人发布的"
 * - 仅返回 ACTIVE 或 FOUND 状态的记录
 */
export async function getSchoolLostFoundEvents(
  schoolId: string
): Promise<
  LostFoundActionResult<
    Array<{
      id: string;
      poiId: string;
      description: string;
      images: string[];
      contactInfo: string | null;
      status: string;
      expiresAt: string;
      createdAt: string;
      userId: string;
      userNickname: string | null;
      poi: { id: string; name: string };
    }>
  >
> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "schoolId 为必填项" };
    }

    const now = new Date();
    const events = await prisma.lostFoundEvent.findMany({
      where: {
        schoolId: schoolId.trim(),
        status: { in: [LostFoundStatus.ACTIVE, LostFoundStatus.FOUND] },
        expiresAt: { gt: now },
      },
      include: {
        poi: { select: { id: true, name: true } },
        user: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: events.map((e) => ({
        id: e.id,
        poiId: e.poiId,
        description: e.description,
        images: (e.images as string[]) ?? [],
        contactInfo: e.contactInfo,
        status: e.status,
        expiresAt: e.expiresAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
        userId: e.user.id,
        userNickname: e.user.nickname,
        poi: { id: e.poi.id, name: e.poi.name },
      })),
    };
  } catch (err) {
    console.error("[getSchoolLostFoundEvents]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取失物招领列表失败",
    };
  }
}

/**
 * 检查失物招领是否存在且是否已过期（用于 deep link 保护）
 * - 多租户：仅允许同校访问
 * - 返回 { exists, expired }，不返回实际内容
 */
export async function checkLostFoundEvent(
  id: string,
  poiId: string,
  schoolId: string
): Promise<
  LostFoundActionResult<{
    exists: boolean;
    expired: boolean;
  }>
> {
  try {
    if (!id?.trim() || !poiId?.trim() || !schoolId?.trim()) {
      return { success: false, error: "参数不完整" };
    }

    const event = await prisma.lostFoundEvent.findFirst({
      where: {
        id: id.trim(),
        poiId: poiId.trim(),
        schoolId: schoolId.trim(),
      },
      select: { id: true, expiresAt: true },
    });

    if (!event) {
      return { success: true, data: { exists: false, expired: false } };
    }

    const now = new Date();
    const expired = now > event.expiresAt;

    return {
      success: true,
      data: { exists: true, expired },
    };
  } catch (err) {
    console.error("[checkLostFoundEvent]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "检查失败",
    };
  }
}

/**
 * 标记为已找到
 * 发布者本人、超级管理员，或本校 ADMIN/STAFF 可操作
 */
export async function markAsFound(id: string): Promise<LostFoundActionResult<void>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const event = await prisma.lostFoundEvent.findUnique({
      where: { id: id.trim() },
      select: { id: true, userId: true, status: true, schoolId: true },
    });

    if (!event) {
      return { success: false, error: "记录不存在" };
    }

    if (event.status !== LostFoundStatus.ACTIVE) {
      return { success: false, error: "该记录已处理，无法重复操作" };
    }

    const isOwner = event.userId === auth.userId;
    if (!isOwner) {
      const isSuperAdmin = auth.role === "SUPER_ADMIN";
      const isSameSchoolStaff =
        (auth.role === "ADMIN" || auth.role === "STAFF") &&
        auth.schoolId != null &&
        auth.schoolId === event.schoolId;
      if (!isSuperAdmin && !isSameSchoolStaff) {
        return {
          success: false,
          error:
            auth.role === "ADMIN" || auth.role === "STAFF"
              ? "无权处理其他学校的失物招领"
              : "仅发布者本人或管理员可标记为已找到",
        };
      }
    }

    await prisma.lostFoundEvent.update({
      where: { id: event.id },
      data: { status: LostFoundStatus.FOUND },
    });

    // 非本人标记为已找到时，通知发布者
    if (!isOwner) {
      await createNotification(
        event.userId,
        auth.userId,
        NotificationType.LOST_FOUND_FOUND,
        event.id,
        NotificationEntityType.LOST_FOUND,
        "您的失物招领已被标记为已找到"
      );
    }

    return { success: true };
  } catch (err) {
    console.error("[markAsFound]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}
