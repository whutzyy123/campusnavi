"use server";

/**
 * 管理员统计聚合 Actions
 * 为超级管理员和校级管理员/工作人员提供角色专属统计数据
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { MarketItemStatus, Prisma } from "@prisma/client";

/** 获取今日 0 点、本周一 0 点、本月 1 号 0 点（本地时区） */
function getDateBoundaries() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { now, today, weekStart, monthStart };
}

/** 获取指定时间范围内有行为的用户数（留言、集市、失物招领、意向、反馈、收藏、集市日志） */
async function countActiveUsersInPeriod(
  start: Date,
  end: Date
): Promise<number> {
  const rows = await prisma.$queryRaw<[{ c: bigint }]>(
    Prisma.sql`
      SELECT COUNT(*) AS c FROM (
        SELECT user_id AS uid FROM comments WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM comment_likes WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM market_items WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM lost_found_events WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM market_intentions WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM feedbacks WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM poi_favorites WHERE created_at >= ${start} AND created_at <= ${end}
        UNION
        SELECT user_id AS uid FROM market_logs WHERE created_at >= ${start} AND created_at <= ${end}
      ) AS active_users
    `
  );
  return Number(rows[0]?.c ?? 0);
}

/** 7日/30日留存率：注册早于 cutoff 的用户中，在 periodStart~periodEnd 有行为的占比 */
async function getRetentionRate(
  cutoff: Date,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const [cohortTotal, cohortActive] = await Promise.all([
    prisma.user.count({
      where: { status: "ACTIVE", createdAt: { lt: cutoff } },
    }),
    prisma.$queryRaw<[{ c: bigint }]>(
      Prisma.sql`
        SELECT COUNT(DISTINCT u.id) AS c FROM users u
        INNER JOIN (
          SELECT user_id AS uid FROM comments WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM comment_likes WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM market_items WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM lost_found_events WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM market_intentions WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM feedbacks WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM poi_favorites WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
          UNION SELECT user_id FROM market_logs WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        ) t ON t.uid = u.id
        WHERE u.status = 'ACTIVE' AND u.created_at < ${cutoff}
      `
    ).then((r) => Number(r[0]?.c ?? 0)),
  ]);
  return cohortTotal > 0 ? Math.round((100 * cohortActive) / cohortTotal) : 0;
}

/** 沉默用户：注册≥cutoff 天前，且在 periodStart~periodEnd 无任何行为 */
async function countDormantUsers(
  cutoff: Date,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const rows = await prisma.$queryRaw<[{ c: bigint }]>(
    Prisma.sql`
      SELECT COUNT(*) AS c FROM users u
      LEFT JOIN (
        SELECT user_id AS uid FROM comments WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM comment_likes WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM market_items WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM lost_found_events WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM market_intentions WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM feedbacks WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM poi_favorites WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
        UNION SELECT user_id FROM market_logs WHERE created_at >= ${periodStart} AND created_at <= ${periodEnd}
      ) t ON t.uid = u.id
      WHERE u.status = 'ACTIVE' AND u.created_at < ${cutoff} AND t.uid IS NULL
    `
  );
  return Number(rows[0]?.c ?? 0);
}

/** 超级管理员统计（完整版） */
export interface SuperAdminStats {
  // 用户增长
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;

  // 用户留存（基于行为：留言、集市、失物招领、意向、反馈、收藏等）
  dauCount: number;
  wauCount: number;
  mauCount: number;
  retention7d: number; // 7日留存率 0-100
  retention30d: number; // 30日留存率 0-100
  dormantUsers: number; // 沉默用户：注册≥30天且近30天无行为

  // 学校
  activeSchools: number;

  // 生存集市
  bazaarHealth: number;
  newListingsToday: number;
  newListingsThisWeek: number;
  newListingsThisMonth: number;
  intentionsCount: number;
  completedTransactions: number;
  expiredItems: number;
  marketByType: { typeId: number; typeName: string; count: number }[];

  // POI 与内容
  totalPOIs: number;
  totalComments: number;
  activeLostFound: number;

  // 消息
  totalNotifications: number;
  notificationReadRate: number;

  // 各类率（分母有效时才计算，否则为 0 或 null）
  userActivationRate: number; // 用户活跃率 = MAU/总用户
  marketCompletionRate: number; // 集市成交率 = 成交/(成交+过期)
  marketExpiryRate: number; // 集市过期率 = 过期/(成交+过期)
  commentEngagementRate: number; // 留言互动率 = 有点赞留言/总留言
  feedbackResolutionRate: number; // 反馈处理率 = 已处理/总反馈
  commentReportResolutionRate: number; // 留言举报处理率 = 已审核/有举报留言
  lostFoundCompletionRate: number; // 失物招领完成率 = 已找到/(已找到+已过期)

  // 内容健康
  pendingCommentReports: number;
  pendingMarketReports: number;
  pendingFeedback: number;
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
 * 超级管理员统计（完整版）
 * 用于系统看板数据展示，支持产品决策与迭代方向参考
 */
export async function getSuperAdminStats(): Promise<
  AdminStatsResult<SuperAdminStats>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };

  const { today, weekStart, monthStart, now } = getDateBoundaries();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    dauCount,
    wauCount,
    mauCount,
    retention7d,
    retention30d,
    dormantUsers,
    activeSchools,
    bazaarHealth,
    newListingsToday,
    newListingsThisWeek,
    newListingsThisMonth,
    intentionsCount,
    completedTransactions,
    expiredItems,
    marketByTypeRaw,
    totalPOIs,
    totalComments,
    activeLostFound,
    notificationTotal,
    notificationRead,
    pendingCommentReports,
    pendingMarketReports,
    pendingFeedback,
    totalFeedback,
    resolvedFeedback,
    commentsWithLikes,
    commentsWithReports,
    commentsReportResolved,
    lostFoundEnded,
    lostFoundFound,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({
      where: { status: "ACTIVE", createdAt: { gte: today } },
    }),
    prisma.user.count({
      where: { status: "ACTIVE", createdAt: { gte: weekStart } },
    }),
    prisma.user.count({
      where: { status: "ACTIVE", createdAt: { gte: monthStart } },
    }),
    countActiveUsersInPeriod(today, now),
    countActiveUsersInPeriod(sevenDaysAgo, now),
    countActiveUsersInPeriod(thirtyDaysAgo, now),
    getRetentionRate(sevenDaysAgo, sevenDaysAgo, now),
    getRetentionRate(thirtyDaysAgo, thirtyDaysAgo, now),
    countDormantUsers(thirtyDaysAgo, thirtyDaysAgo, now),
    prisma.school.count({
      where: { isActive: true, pois: { some: {} } },
    }),
    prisma.marketItem.count({
      where: {
        status: MarketItemStatus.ACTIVE,
        isHidden: false,
        expiresAt: { gt: now },
      },
    }),
    prisma.marketItem.count({
      where: { status: MarketItemStatus.ACTIVE, createdAt: { gte: today } },
    }),
    prisma.marketItem.count({
      where: { status: MarketItemStatus.ACTIVE, createdAt: { gte: weekStart } },
    }),
    prisma.marketItem.count({
      where: { status: MarketItemStatus.ACTIVE, createdAt: { gte: monthStart } },
    }),
    prisma.marketIntention.count(),
    prisma.marketItem.count({
      where: { status: MarketItemStatus.COMPLETED },
    }),
    prisma.marketItem.count({
      where: {
        status: MarketItemStatus.ACTIVE,
        expiresAt: { lt: now },
      },
    }),
    prisma.marketItem.groupBy({
      by: ["typeId"],
      where: { status: MarketItemStatus.ACTIVE },
      _count: { id: true },
    }),
    prisma.pOI.count(),
    prisma.comment.count(),
    prisma.lostFoundEvent.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
    }),
    prisma.notification.count(),
    prisma.notification.count({ where: { isRead: true } }),
    prisma.comment.count({
      where: {
        reportCount: { gte: 3 },
        isReviewed: false,
      },
    }),
    prisma.marketItem.count({
      where: {
        OR: [{ reportCount: { gte: 1 } }, { isHidden: true }],
      },
    }),
    prisma.feedback.count({
      where: { status: "PENDING" },
    }),
    // 率指标所需额外数据
    prisma.feedback.count(),
    prisma.feedback.count({
      where: { status: { in: ["RESOLVED", "REJECTED"] } },
    }),
    prisma.comment.count({ where: { likeCount: { gt: 0 } } }),
    prisma.comment.count({ where: { reportCount: { gte: 3 } } }),
    prisma.comment.count({
      where: { reportCount: { gte: 3 }, isReviewed: true },
    }),
    prisma.lostFoundEvent.count({
      where: { status: { in: ["FOUND", "EXPIRED"] } },
    }),
    prisma.lostFoundEvent.count({
      where: { status: "FOUND" },
    }),
  ]);

  const transactionTypes = await prisma.marketTransactionType.findMany({
    select: { id: true, name: true },
  });
  const typeMap = new Map(transactionTypes.map((t) => [t.id, t.name]));
  const marketByType = marketByTypeRaw.map((g) => ({
    typeId: g.typeId,
    typeName: typeMap.get(g.typeId) ?? "未知",
    count: g._count.id,
  }));

  const notificationReadRate =
    notificationTotal > 0
      ? Math.round((notificationRead / notificationTotal) * 100)
      : 0;

  // 各类率（分母有效时计算，否则为 0）
  const userActivationRate =
    totalUsers > 0 ? Math.round((100 * mauCount) / totalUsers) : 0;
  const endedMarket = completedTransactions + expiredItems;
  const marketCompletionRate =
    endedMarket > 0
      ? Math.round((100 * completedTransactions) / endedMarket)
      : 0;
  const marketExpiryRate =
    endedMarket > 0 ? Math.round((100 * expiredItems) / endedMarket) : 0;
  const commentEngagementRate =
    totalComments > 0
      ? Math.round((100 * commentsWithLikes) / totalComments)
      : 0;
  const feedbackResolutionRate =
    totalFeedback > 0
      ? Math.round((100 * resolvedFeedback) / totalFeedback)
      : 0;
  const commentReportResolutionRate =
    commentsWithReports > 0
      ? Math.round((100 * commentsReportResolved) / commentsWithReports)
      : 0;
  const lostFoundCompletionRate =
    lostFoundEnded > 0
      ? Math.round((100 * lostFoundFound) / lostFoundEnded)
      : 0;

  return {
    success: true,
    data: {
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      dauCount,
      wauCount,
      mauCount,
      retention7d,
      retention30d,
      dormantUsers,
      activeSchools,
      bazaarHealth,
      newListingsToday,
      newListingsThisWeek,
      newListingsThisMonth,
      intentionsCount,
      completedTransactions,
      expiredItems,
      marketByType,
      totalPOIs,
      totalComments,
      activeLostFound,
      totalNotifications: notificationTotal,
      notificationReadRate,
      userActivationRate,
      marketCompletionRate,
      marketExpiryRate,
      commentEngagementRate,
      feedbackResolutionRate,
      commentReportResolutionRate,
      lostFoundCompletionRate,
      pendingCommentReports,
      pendingMarketReports,
      pendingFeedback,
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
