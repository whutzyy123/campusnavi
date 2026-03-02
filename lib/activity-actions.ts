"use server";

/**
 * Activity (活动管理) Server Actions
 * R17: 校内活动 CRUD，严格遵循 schoolId 多租户隔离
 */

import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { validateContent } from "@/lib/content-validator";

export interface ActivityActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActivityItem {
  id: string;
  schoolId: string;
  poiId: string;
  title: string;
  description: string;
  link: string | null;
  startAt: string;
  endAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 校验当前用户是否为 ADMIN 或 STAFF，并返回鉴权上下文
 * schoolId 和 createdBy 必须从鉴权上下文注入，忽略客户端传入
 */
async function requireAdminOrStaff(): Promise<
  { ok: true; userId: string; schoolId: string; role: string } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }
  if (auth.role !== "ADMIN" && auth.role !== "STAFF") {
    return { ok: false, error: "仅校管或工作人员可管理活动" };
  }
  if (!auth.schoolId) {
    return { ok: false, error: "校管/工作人员必须绑定学校" };
  }
  return {
    ok: true,
    userId: auth.userId,
    schoolId: auth.schoolId,
    role: auth.role,
  };
}

/** ADMIN / SUPER_ADMIN 豁免敏感词与 6 位数字过滤（仅限活动 title、description；link 对所有角色均不经过 validateContent） */
function shouldExemptContentFilter(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * 校验活动内容（供前端预校验）
 * ADMIN/SUPER_ADMIN 直接返回 valid；STAFF 经 validateContent 校验
 */
export async function validateActivityContent(
  title: string,
  description: string
): Promise<{ valid: boolean; error?: string }> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { valid: false, error: "请先登录" };
  }
  if (shouldExemptContentFilter(auth.role)) {
    return { valid: true };
  }
  try {
    await validateContent(title.trim(), { checkNumbers: true });
    await validateContent(description.trim(), { checkNumbers: true });
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
    };
  }
}

/**
 * 校验 URL 格式（必须以 http:// 或 https:// 开头）
 */
function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

/**
 * 创建活动
 * - 权限：ADMIN 或 STAFF
 * - schoolId、createdBy 从鉴权注入，忽略客户端传入
 * - startAt < endAt，endAt 必须为未来时间
 * - title、description：ADMIN/SUPER_ADMIN 豁免敏感词与 6 位数字过滤；STAFF 仍经 validateContent 校验
 * - link：仅校验 URL 格式（http/https），永不经过 validateContent；含 tracking ID 等长数字的 URL 不受 6 位数字限制
 */
export async function createActivity(input: {
  poiId: string;
  title: string;
  description: string;
  link?: string | null;
  startAt: string; // ISO 字符串
  endAt: string;
}): Promise<ActivityActionResult<ActivityItem>> {
  try {
    const authResult = await requireAdminOrStaff();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }
    const { userId, schoolId, role } = authResult;

    const { poiId, title, description, link, startAt, endAt } = input;

    if (!poiId?.trim() || !title?.trim() || !description?.trim() || !startAt || !endAt) {
      return { success: false, error: "poiId、title、description、startAt、endAt 为必填项" };
    }

    if (title.trim().length > 100) {
      return { success: false, error: "标题最多 100 字" };
    }
    if (description.trim().length > 1000) {
      return { success: false, error: "描述最多 1000 字" };
    }

    // link：仅 URL 格式校验，不经过 validateContent（含 tracking ID 等长数字的 URL 不受 6 位数字限制）
    if (link != null && link.trim() !== "" && !isValidUrl(link)) {
      return { success: false, error: "活动链接必须以 http:// 或 https:// 开头" };
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { success: false, error: "开始时间或结束时间格式无效" };
    }
    if (start >= end) {
      return { success: false, error: "开始时间必须早于结束时间" };
    }
    if (end <= now) {
      return { success: false, error: "结束时间必须为未来时间" };
    }

    let sanitizedTitle: string;
    let sanitizedDescription: string;
    if (shouldExemptContentFilter(role)) {
      sanitizedTitle = title.trim();
      sanitizedDescription = description.trim();
    } else {
      try {
        sanitizedTitle = (await validateContent(title.trim(), { checkNumbers: true })).trim();
        sanitizedDescription = (await validateContent(description.trim(), { checkNumbers: true })).trim();
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }

    // 校验 POI 存在且属于当前学校
    const poi = await prisma.pOI.findFirst({
      where: { id: poiId.trim(), schoolId },
      select: { id: true },
    });
    if (!poi) {
      return { success: false, error: "POI 不存在或无权在该 POI 下创建活动" };
    }

    const activity = await prisma.activity.create({
      data: {
        schoolId,
        poiId: poi.id,
        title: sanitizedTitle,
        description: sanitizedDescription,
        link: link?.trim() || null,
        startAt: start,
        endAt: end,
        createdBy: userId,
      },
    });

    return {
      success: true,
      data: {
        id: activity.id,
        schoolId: activity.schoolId,
        poiId: activity.poiId,
        title: activity.title,
        description: activity.description,
        link: activity.link,
        startAt: activity.startAt.toISOString(),
        endAt: activity.endAt.toISOString(),
        createdBy: activity.createdBy,
        createdAt: activity.createdAt.toISOString(),
        updatedAt: activity.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[createActivity]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建活动失败",
    };
  }
}

/**
 * 更新活动
 * - 权限：ADMIN 或 STAFF，且活动必须属于当前学校
 * - startAt < endAt（更新时 endAt 可为过去，用于修正历史数据）
 * - title、description：ADMIN/SUPER_ADMIN 豁免敏感词与 6 位数字过滤；STAFF 仍经 validateContent 校验
 * - link：仅校验 URL 格式，永不经过 validateContent
 */
export async function updateActivity(
  id: string,
  input: {
    title?: string;
    description?: string;
    link?: string | null;
    startAt?: string;
    endAt?: string;
  }
): Promise<ActivityActionResult<ActivityItem>> {
  try {
    const authResult = await requireAdminOrStaff();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }
    const { schoolId, role } = authResult;

    const existing = await prisma.activity.findFirst({
      where: { id: id.trim(), schoolId },
    });
    if (!existing) {
      return { success: false, error: "活动不存在或无权编辑" };
    }

    const updates: {
      title?: string;
      description?: string;
      link?: string | null;
      startAt?: Date;
      endAt?: Date;
    } = {};

    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) return { success: false, error: "标题不能为空" };
      if (t.length > 100) return { success: false, error: "标题最多 100 字" };
      if (shouldExemptContentFilter(role)) {
        updates.title = t;
      } else {
        try {
          updates.title = (await validateContent(t, { checkNumbers: true })).trim();
        } catch (e) {
          return {
            success: false,
            error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
          };
        }
      }
    }
    if (input.description !== undefined) {
      const d = input.description.trim();
      if (d.length > 1000) return { success: false, error: "描述最多 1000 字" };
      if (shouldExemptContentFilter(role)) {
        updates.description = d;
      } else {
        try {
          updates.description = (await validateContent(d, { checkNumbers: true })).trim();
        } catch (e) {
          return {
            success: false,
            error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
          };
        }
      }
    }
    // link：仅 URL 格式校验，不经过 validateContent
    if (input.link !== undefined) {
      if (input.link != null && input.link.trim() !== "" && !isValidUrl(input.link)) {
        return { success: false, error: "活动链接必须以 http:// 或 https:// 开头" };
      }
      updates.link = input.link?.trim() || null;
    }
    if (input.startAt !== undefined || input.endAt !== undefined) {
      const start = input.startAt ? new Date(input.startAt) : existing.startAt;
      const end = input.endAt ? new Date(input.endAt) : existing.endAt;
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { success: false, error: "开始时间或结束时间格式无效" };
      }
      if (start >= end) {
        return { success: false, error: "开始时间必须早于结束时间" };
      }
      updates.startAt = start;
      updates.endAt = end;
    }

    const activity = await prisma.activity.update({
      where: { id: existing.id },
      data: updates,
    });

    return {
      success: true,
      data: {
        id: activity.id,
        schoolId: activity.schoolId,
        poiId: activity.poiId,
        title: activity.title,
        description: activity.description,
        link: activity.link,
        startAt: activity.startAt.toISOString(),
        endAt: activity.endAt.toISOString(),
        createdBy: activity.createdBy,
        createdAt: activity.createdAt.toISOString(),
        updatedAt: activity.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[updateActivity]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新活动失败",
    };
  }
}

/**
 * 删除活动
 * - 权限：ADMIN 或 STAFF，且活动必须属于当前学校
 */
export async function deleteActivity(id: string): Promise<ActivityActionResult<void>> {
  try {
    const authResult = await requireAdminOrStaff();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }
    const { schoolId } = authResult;

    const existing = await prisma.activity.findFirst({
      where: { id: id.trim(), schoolId },
    });
    if (!existing) {
      return { success: false, error: "活动不存在或无权删除" };
    }

    await prisma.activity.delete({
      where: { id: existing.id },
    });

    return { success: true };
  } catch (err) {
    console.error("[deleteActivity]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除活动失败",
    };
  }
}

/**
 * 按学校获取活动列表（管理端）
 * - 权限：ADMIN 或 STAFF，仅返回本校活动
 * - 包含已过期活动，便于管理
 */
export async function getActivitiesBySchool(): Promise<
  ActivityActionResult<
    Array<{
      id: string;
      poiId: string;
      poiName: string;
      title: string;
      description: string;
      link: string | null;
      startAt: string;
      endAt: string;
      createdBy: string;
      createdAt: string;
      updatedAt: string;
    }>
  >
> {
  try {
    const authResult = await requireAdminOrStaff();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }
    const { schoolId } = authResult;

    const activities = await prisma.activity.findMany({
      where: { schoolId },
      select: {
        id: true,
        poiId: true,
        title: true,
        description: true,
        link: true,
        startAt: true,
        endAt: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        poi: { select: { name: true } },
      },
      orderBy: [{ endAt: "desc" }, { startAt: "desc" }],
    });

    return {
      success: true,
      data: activities.map((a) => ({
        id: a.id,
        poiId: a.poiId,
        poiName: a.poi?.name ?? "未知 POI",
        title: a.title,
        description: a.description,
        link: a.link,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
        createdBy: a.createdBy,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[getActivitiesBySchool]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取活动列表失败",
    };
  }
}

/**
 * 按学校获取当前进行中的活动（搜索预取 / 地图展示）
 * 内部辅助：返回 startAt <= now <= endAt 的活动，供搜索、地图等预取
 * 不要求登录，由调用方传入 schoolId（如 activeSchool.id）
 */
export async function getActiveActivitiesBySchool(schoolId: string): Promise<
  ActivityActionResult<
    Array<{
      id: string;
      poiId: string;
      poiName: string;
      title: string;
      description: string;
      link: string | null;
      startAt: string;
      endAt: string;
    }>
  >
> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "schoolId 为必填项" };
    }

    const now = new Date();
    const activities = await prisma.activity.findMany({
      where: {
        schoolId: schoolId.trim(),
        startAt: { lte: now },
        endAt: { gte: now },
      },
      select: {
        id: true,
        poiId: true,
        title: true,
        description: true,
        link: true,
        startAt: true,
        endAt: true,
        poi: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });

    return {
      success: true,
      data: activities.map((a) => ({
        id: a.id,
        poiId: a.poiId,
        poiName: a.poi?.name ?? "未知 POI",
        title: a.title,
        description: a.description,
        link: a.link,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[getActiveActivitiesBySchool]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取活动列表失败",
    };
  }
}

/**
 * 获取学校当前进行中的活动数量（轻量级，用于 UI 条件展示如「热门搜索」）
 * - 条件：schoolId 匹配，且 startAt <= now <= endAt
 * - 不要求登录
 */
export async function getActiveActivitiesCount(
  schoolId: string
): Promise<ActivityActionResult<number>> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "schoolId 为必填项" };
    }

    const now = new Date();
    const count = await prisma.activity.count({
      where: {
        schoolId: schoolId.trim(),
        startAt: { lte: now },
        endAt: { gte: now },
      },
    });

    return { success: true, data: count };
  } catch (err) {
    console.error("[getActiveActivitiesCount]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取活动数量失败",
    };
  }
}

/**
 * 按 POI 获取当前有效活动（C 端展示）
 * 仅返回 endAt > now 的活动，不要求登录
 */
export async function getActiveActivitiesByPoi(
  poiId: string,
  schoolId: string
): Promise<
  ActivityActionResult<
    Array<{
      id: string;
      title: string;
      description: string;
      link: string | null;
      startAt: string;
      endAt: string;
    }>
  >
> {
  try {
    if (!poiId?.trim() || !schoolId?.trim()) {
      return { success: false, error: "poiId 和 schoolId 为必填项" };
    }

    const now = new Date();
    const activities = await prisma.activity.findMany({
      where: {
        poiId: poiId.trim(),
        schoolId: schoolId.trim(),
        endAt: { gt: now },
      },
      select: {
        id: true,
        title: true,
        description: true,
        link: true,
        startAt: true,
        endAt: true,
      },
      orderBy: { startAt: "asc" },
    });

    return {
      success: true,
      data: activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        link: a.link,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[getActiveActivitiesByPoi]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取活动列表失败",
    };
  }
}
