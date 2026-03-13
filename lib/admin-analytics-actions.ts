"use server";

/**
 * 超级管理员数据分析 - 时序与明细数据
 * 为详细图表页提供按日聚合的数据
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { MarketItemStatus, Prisma } from "@prisma/client";

export type AnalyticsDays = 7 | 30 | 365;

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
  label?: string;
}

export interface MultiSeriesPoint {
  date: string;
  [key: string]: string | number;
}

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  if (!user || user.role !== 4) {
    return { ok: false, error: "权限不足" };
  }
  return { ok: true };
}

function getStartDate(days: AnalyticsDays): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 填充缺失日期为 0 */
function fillDates(data: TimeSeriesPoint[], days: AnalyticsDays): TimeSeriesPoint[] {
  const start = getStartDate(days);
  const map = new Map(data.map((p) => [p.date, p.value]));
  const out: TimeSeriesPoint[] = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    out.push({ date: dateStr, value: map.get(dateStr) ?? 0 });
  }
  return out;
}

export type AnalyticsResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ========== 用户增长 ==========

export async function getNewUsersTrend(
  days: AnalyticsDays
): Promise<AnalyticsResult<TimeSeriesPoint[]>> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const rows = await prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
    Prisma.sql`
      SELECT DATE(created_at) AS dt, COUNT(*) AS cnt
      FROM users
      WHERE status = 'ACTIVE' AND created_at >= ${start}
      GROUP BY DATE(created_at)
      ORDER BY dt
    `
  );
  const data = fillDates(
    rows.map((r) => ({
      date: r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10),
      value: Number(r.cnt),
    })),
    days
  );
  return { success: true, data };
}

export async function getCumulativeUsersTrend(
  days: AnalyticsDays
): Promise<AnalyticsResult<TimeSeriesPoint[]>> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const result = await getNewUsersTrend(days);
  if (!result.success) return result;
  const byDate = new Map(result.data.map((p) => [p.date, p.value]));
  const start = getStartDate(days);
  let cum = await prisma.user.count({
    where: { status: "ACTIVE", createdAt: { lt: start } },
  });
  const out: TimeSeriesPoint[] = [];
  const d = new Date(start);
  const end = new Date();
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    cum += byDate.get(ds) ?? 0;
    out.push({ date: ds, value: cum });
    d.setDate(d.getDate() + 1);
  }
  return { success: true, data: out };
}

export async function getNewUsersBySchool(
  days: AnalyticsDays
): Promise<AnalyticsResult<{ schoolName: string; schoolId: string; count: number }[]>> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const rows = await prisma.$queryRaw<{ school_id: string | null; school_name: string; cnt: bigint }[]>(
    Prisma.sql`
      SELECT u.school_id, COALESCE(s.name, '未绑定') AS school_name, COUNT(*) AS cnt
      FROM users u
      LEFT JOIN schools s ON s.id = u.school_id
      WHERE u.status = 'ACTIVE' AND u.created_at >= ${start}
      GROUP BY u.school_id, s.name
      ORDER BY cnt DESC
    `
  );
  const data = rows.map((r) => ({
    schoolName: r.school_name,
    schoolId: r.school_id ?? "",
    count: Number(r.cnt),
  }));
  return { success: true, data };
}

// ========== 用户留存 ==========

async function fetchActivityByDay(start: Date): Promise<Map<string, Set<string>>> {
  const tables = [
    ["comments", "user_id"],
    ["comment_likes", "user_id"],
    ["market_items", "user_id"],
    ["lost_found_events", "user_id"],
    ["market_intentions", "user_id"],
    ["feedbacks", "user_id"],
    ["poi_favorites", "user_id"],
    ["market_logs", "user_id"],
  ] as const;
  const byDate = new Map<string, Set<string>>();
  for (const [table, col] of tables) {
    const rows = await prisma.$queryRawUnsafe<{ dt: Date; uid: string }[]>(
      `SELECT DATE(created_at) AS dt, ${col} AS uid FROM ${table} WHERE created_at >= ?`,
      start
    );
    for (const r of rows) {
      const ds = r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10);
      if (!byDate.has(ds)) byDate.set(ds, new Set());
      byDate.get(ds)!.add(r.uid);
    }
  }
  return byDate;
}

export async function getDauWauMauTrend(
  days: AnalyticsDays
): Promise<
  AnalyticsResult<{ date: string; dau: number; wau: number; mau: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const byDate = await fetchActivityByDay(start);
  const out: { date: string; dau: number; wau: number; mau: number }[] = [];
  const d = new Date(start);
  const end = new Date();
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    const dau = byDate.get(ds)?.size ?? 0;
    const day7 = new Date(d);
    day7.setDate(day7.getDate() - 6);
    const day30 = new Date(d);
    day30.setDate(day30.getDate() - 29);
    let wauSet = new Set<string>();
    let mauSet = new Set<string>();
    for (const [dateStr, uids] of byDate) {
      if (dateStr >= day7.toISOString().slice(0, 10) && dateStr <= ds) {
        uids.forEach((id) => wauSet.add(id));
      }
      if (dateStr >= day30.toISOString().slice(0, 10) && dateStr <= ds) {
        uids.forEach((id) => mauSet.add(id));
      }
    }
    out.push({ date: ds, dau, wau: wauSet.size, mau: mauSet.size });
    d.setDate(d.getDate() + 1);
  }
  return { success: true, data: out };
}

export async function getRetentionTrend(
  days: AnalyticsDays
): Promise<
  AnalyticsResult<{ date: string; retention7d: number; retention30d: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const dauWauResult = await getDauWauMauTrend(days);
  if (!dauWauResult.success) return dauWauResult;
  const dauWau = dauWauResult.data;
  const start = getStartDate(days);
  const [totalUsersBeforeStart, newUsersByDay] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE", createdAt: { lt: start } } }),
    getNewUsersTrend(days),
  ]);
  if (!newUsersByDay.success) return newUsersByDay;
  const newByDate = new Map(newUsersByDay.data.map((p) => [p.date, p.value]));
  let cumUsers = totalUsersBeforeStart;
  const out: { date: string; retention7d: number; retention30d: number }[] = [];
  for (const row of dauWau) {
    cumUsers += newByDate.get(row.date) ?? 0;
    const cohort7 = cumUsers - (newByDate.get(row.date) ?? 0);
    const r7 = cohort7 > 0 ? Math.round((100 * row.wau) / cohort7) : 0;
    const r30 = cumUsers > 0 ? Math.round((100 * row.mau) / cumUsers) : 0;
    out.push({ date: row.date, retention7d: Math.min(r7, 100), retention30d: Math.min(r30, 100) });
  }
  return { success: true, data: out };
}

export async function getDormantTrend(
  days: AnalyticsDays
): Promise<AnalyticsResult<TimeSeriesPoint[]>> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const rows = await prisma.$queryRaw<[{ c: bigint }]>(
    Prisma.sql`
      SELECT COUNT(*) AS c FROM users u
      LEFT JOIN (
        SELECT user_id AS uid FROM comments WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM comment_likes WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM market_items WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM lost_found_events WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM market_intentions WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM feedbacks WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM poi_favorites WHERE created_at >= ${thirtyDaysAgo}
        UNION SELECT user_id FROM market_logs WHERE created_at >= ${thirtyDaysAgo}
      ) t ON t.uid = u.id
      WHERE u.status = 'ACTIVE' AND u.created_at < ${thirtyDaysAgo} AND t.uid IS NULL
    `
  );
  const dormant = Number(rows[0]?.c ?? 0);
  const out: TimeSeriesPoint[] = [];
  const d = getStartDate(days);
  const end = new Date();
  while (d <= end) {
    out.push({ date: d.toISOString().slice(0, 10), value: dormant });
    d.setDate(d.getDate() + 1);
  }
  return { success: true, data: out };
}

// ========== 生存集市 ==========

export async function getMarketListingsTrend(
  days: AnalyticsDays
): Promise<
  AnalyticsResult<{ date: string; newListings: number; completed: number; expired: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const [newRows, completedRows, expiredRows] = await Promise.all([
    prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
      Prisma.sql`
        SELECT DATE(created_at) AS dt, COUNT(*) AS cnt FROM market_items
        WHERE status = 'ACTIVE' AND created_at >= ${start}
        GROUP BY DATE(created_at) ORDER BY dt
      `
    ),
    prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
      Prisma.sql`
        SELECT DATE(updated_at) AS dt, COUNT(*) AS cnt FROM market_items
        WHERE status = 'COMPLETED' AND updated_at >= ${start}
        GROUP BY DATE(updated_at) ORDER BY dt
      `
    ),
    prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
      Prisma.sql`
        SELECT DATE(expires_at) AS dt, COUNT(*) AS cnt FROM market_items
        WHERE status = 'ACTIVE' AND expires_at >= ${start} AND expires_at < NOW()
        GROUP BY DATE(expires_at) ORDER BY dt
      `
    ),
  ]);
  const toMap = (rows: { dt: Date; cnt: bigint }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const ds = r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10);
      m.set(ds, Number(r.cnt));
    }
    return m;
  };
  const newMap = toMap(newRows);
  const completedMap = toMap(completedRows);
  const expiredMap = toMap(expiredRows);
  const out: { date: string; newListings: number; completed: number; expired: number }[] = [];
  const d = new Date(start);
  const end = new Date();
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    out.push({
      date: ds,
      newListings: newMap.get(ds) ?? 0,
      completed: completedMap.get(ds) ?? 0,
      expired: expiredMap.get(ds) ?? 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return { success: true, data: out };
}

export async function getMarketByType(): Promise<
  AnalyticsResult<{ typeName: string; count: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const grouped = await prisma.marketItem.groupBy({
    by: ["typeId"],
    where: { status: MarketItemStatus.ACTIVE },
    _count: { id: true },
  });
  const types = await prisma.marketTransactionType.findMany({
    select: { id: true, name: true },
  });
  const typeMap = new Map(types.map((t) => [t.id, t.name]));
  const data = grouped.map((g) => ({
    typeName: typeMap.get(g.typeId) ?? "未知",
    count: g._count.id,
  }));
  return { success: true, data };
}

export async function getMarketBySchool(): Promise<
  AnalyticsResult<{ schoolName: string; count: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const rows = await prisma.$queryRaw<{ school_name: string; cnt: bigint }[]>(
    Prisma.sql`
      SELECT COALESCE(s.name, '未绑定') AS school_name, COUNT(*) AS cnt
      FROM market_items m
      LEFT JOIN schools s ON s.id = m.school_id
      WHERE m.status = 'ACTIVE'
      GROUP BY m.school_id, school_name
      ORDER BY cnt DESC
    `
  );
  const data = rows.map((r) => ({ schoolName: r.school_name, count: Number(r.cnt) }));
  return { success: true, data };
}

// ========== 地图与内容 ==========

export async function getCommentsTrend(
  days: AnalyticsDays
): Promise<AnalyticsResult<TimeSeriesPoint[]>> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const rows = await prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
    Prisma.sql`
      SELECT DATE(created_at) AS dt, COUNT(*) AS cnt FROM comments
      WHERE created_at >= ${start}
      GROUP BY DATE(created_at) ORDER BY dt
    `
  );
  const map = new Map(rows.map((r) => {
    const ds = r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10);
    return [ds, { date: ds, value: Number(r.cnt) }];
  }));
  const data = fillDates(Array.from(map.values()), days);
  return { success: true, data };
}

export async function getPoiTrend(
  days: AnalyticsDays
): Promise<AnalyticsResult<TimeSeriesPoint[]>> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const rows = await prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
    Prisma.sql`
      SELECT DATE(created_at) AS dt, COUNT(*) AS cnt FROM pois
      WHERE created_at >= ${start}
      GROUP BY DATE(created_at) ORDER BY dt
    `
  );
  const map = new Map(rows.map((r) => {
    const ds = r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10);
    return [ds, { date: ds, value: Number(r.cnt) }];
  }));
  const data = fillDates(Array.from(map.values()), days);
  return { success: true, data };
}

export async function getContentBySchool(): Promise<
  AnalyticsResult<{ schoolName: string; pois: number; comments: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const rows = await prisma.$queryRaw<
    { school_name: string; poi_cnt: bigint; comment_cnt: bigint }[]
  >(
    Prisma.sql`
      SELECT COALESCE(s.name, '未绑定') AS school_name,
        (SELECT COUNT(*) FROM pois p WHERE p.school_id = s.id) AS poi_cnt,
        (SELECT COUNT(*) FROM comments c WHERE c.school_id = s.id) AS comment_cnt
      FROM schools s
      WHERE s.is_active = 1
      ORDER BY poi_cnt DESC
    `
  );
  const data = rows.map((r) => ({
    schoolName: r.school_name,
    pois: Number(r.poi_cnt),
    comments: Number(r.comment_cnt),
  }));
  return { success: true, data };
}

// ========== 消息与健康 ==========

export async function getNotificationsTrend(
  days: AnalyticsDays
): Promise<
  AnalyticsResult<{ date: string; total: number; read: number; readRate: number }[]>
> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };
  const start = getStartDate(days);
  const [totalRows, readRows] = await Promise.all([
    prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
      Prisma.sql`
        SELECT DATE(created_at) AS dt, COUNT(*) AS cnt FROM notifications
        WHERE created_at >= ${start}
        GROUP BY DATE(created_at) ORDER BY dt
      `
    ),
    prisma.$queryRaw<{ dt: Date; cnt: bigint }[]>(
      Prisma.sql`
        SELECT DATE(created_at) AS dt, COUNT(*) AS cnt FROM notifications
        WHERE created_at >= ${start} AND is_read = 1
        GROUP BY DATE(created_at) ORDER BY dt
      `
    ),
  ]);
  const totalMap = new Map<string, number>();
  const readMap = new Map<string, number>();
  for (const r of totalRows) {
    const ds = r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10);
    totalMap.set(ds, Number(r.cnt));
  }
  for (const r of readRows) {
    const ds = r.dt instanceof Date ? r.dt.toISOString().slice(0, 10) : String(r.dt).slice(0, 10);
    readMap.set(ds, Number(r.cnt));
  }
  const out: { date: string; total: number; read: number; readRate: number }[] = [];
  const d = new Date(start);
  const end = new Date();
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    const total = totalMap.get(ds) ?? 0;
    const read = readMap.get(ds) ?? 0;
    out.push({
      date: ds,
      total,
      read,
      readRate: total > 0 ? Math.round((100 * read) / total) : 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return { success: true, data: out };
}
