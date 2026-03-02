"use server";

/**
 * 管理员统计聚合 Actions
 * 为超级管理员和校级管理员/工作人员提供角色专属统计数据
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { MarketItemStatus } from "@prisma/client";

/** 超级管理员统计 */
export interface SuperAdminStats {
  totalUsers: number;
  activeSchools: number;
  bazaarHealth: number;
}

/** 校级管理员统计 */
export interface SchoolAdminStats {
  campusUsers: number;
  poiCount: { official: number; userContributed: number };
  pendingAudit: number;
  activeEvents: number;
  bazaarActivity: number;
}

export type AdminStatsResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  if (!user || user.role !== 4) {
    return { ok: false, error: "权限不足，仅超级管理员可执行此操作" };
  }
  return { ok: true, userId: auth.userId };
}

async function requireAdminOrStaff(): Promise<
  | { ok: true; auth: { userId: string; role?: string; schoolId?: string | null } }
  | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  const isAdmin =
    auth.role === "ADMIN" || auth.role === "STAFF" || auth.role === "SUPER_ADMIN";
  if (!isAdmin) return { ok: false, error: "无权限" };
  return { ok: true, auth };
}

/**
 * 超级管理员统计
 * - totalUsers: 全局用户数
 * - activeSchools: 至少有一个 POI 的学校数
 * - bazaarHealth: 全平台 ACTIVE 集市商品数
 * 注：审核相关统计由校级管理员/工作人员负责，超管不参与
 */
export async function getSuperAdminStats(): Promise<
  AdminStatsResult<SuperAdminStats>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };

  const [totalUsers, activeSchools, bazaarHealth] = await Promise.all([
    prisma.user.count(),
    prisma.school.count({
      where: {
        pois: { some: {} },
      },
    }),
    prisma.marketItem.count({
      where: { status: MarketItemStatus.ACTIVE },
    }),
  ]);

  return {
    success: true,
    data: {
      totalUsers,
      activeSchools,
      bazaarHealth,
    },
  };
}

/**
 * 校级管理员/工作人员统计（严格按 schoolId 隔离）
 * - campusUsers: 本校用户数
 * - poiCount: 官方 vs 用户贡献 POI 数
 * - pendingAudit: 本校待审核举报（留言 + 集市）
 * - activeEvents: 本校进行中的活动数
 * - bazaarActivity: 本校 ACTIVE 集市商品数
 */
export async function getSchoolAdminStats(
  schoolId: string
): Promise<AdminStatsResult<SchoolAdminStats>> {
  const perm = await requireAdminOrStaff();
  if (!perm.ok) return { success: false, error: perm.error };

  if (perm.auth.role !== "SUPER_ADMIN" && perm.auth.schoolId !== schoolId) {
    return { success: false, error: "只能查看本校数据" };
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return { success: false, error: "学校不存在" };
  }

  const now = new Date();

  const [
    campusUsers,
    poiGrouped,
    commentPending,
    marketPending,
    activeEvents,
    bazaarActivity,
  ] = await Promise.all([
    prisma.user.count({
      where: { schoolId },
    }),
    prisma.pOI.groupBy({
      by: ["isOfficial"],
      where: { schoolId },
      _count: { id: true },
    }),
    prisma.comment.count({
      where: {
        schoolId,
        reportCount: { gte: 3 },
        isReviewed: false,
      },
    }),
    prisma.marketItem.count({
      where: {
        schoolId,
        OR: [{ reportCount: { gte: 1 } }, { isHidden: true }],
      },
    }),
    prisma.activity.count({
      where: {
        schoolId,
        startAt: { lte: now },
        endAt: { gte: now },
      },
    }),
    prisma.marketItem.count({
      where: {
        schoolId,
        status: MarketItemStatus.ACTIVE,
      },
    }),
  ]);

  const officialCount =
    poiGrouped.find((g) => g.isOfficial)?._count.id ?? 0;
  const userContributedCount =
    poiGrouped.find((g) => !g.isOfficial)?._count.id ?? 0;

  return {
    success: true,
    data: {
      campusUsers,
      poiCount: {
        official: officialCount,
        userContributed: userContributedCount,
      },
      pendingAudit: commentPending + marketPending,
      activeEvents,
      bazaarActivity,
    },
  };
}
