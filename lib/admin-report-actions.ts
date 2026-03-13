"use server";

/**
 * 超级管理员周报、月报、年报
 * 支持 CSV 导出
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import {
  getNewUsersTrend,
  getNewUsersBySchool,
  getDauWauMauTrend,
  getMarketListingsTrend,
  getMarketByType,
  getMarketBySchool,
  getCommentsTrend,
  getPoiTrend,
  getContentBySchool,
  getNotificationsTrend,
} from "./admin-analytics-actions";
import { getSuperAdminStats } from "./admin-actions";

export type ReportPeriod = "week" | "month" | "year";

const PERIOD_DAYS: Record<ReportPeriod, number> = {
  week: 7,
  month: 30,
  year: 365,
};

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  week: "周报",
  month: "月报",
  year: "年报",
};

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

function getPeriodRange(period: ReportPeriod): { start: Date; end: Date; startStr: string; endStr: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - PERIOD_DAYS[period]);
  start.setHours(0, 0, 0, 0);
  return {
    start,
    end,
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  };
}

export type ReportExportResult =
  | { success: true; csv: string; filename: string }
  | { success: false; error: string };

/** 导出周报/月报/年报为 CSV */
export async function exportReportCsv(
  period: ReportPeriod
): Promise<ReportExportResult> {
  const perm = await requireSuperAdmin();
  if (!perm.ok) return { success: false, error: perm.error };

  const days = PERIOD_DAYS[period] as 7 | 30 | 365;
  const { startStr, endStr } = getPeriodRange(period);
  const label = PERIOD_LABELS[period];

  try {
    const [
      newUsersRes,
      newUsersBySchoolRes,
      dauWauRes,
      marketTrendRes,
      marketByTypeRes,
      marketBySchoolRes,
      commentsRes,
      poiRes,
      contentBySchoolRes,
      notificationsRes,
    ] = await Promise.all([
      getNewUsersTrend(days),
      getNewUsersBySchool(days),
      getDauWauMauTrend(days),
      getMarketListingsTrend(days),
      getMarketByType(),
      getMarketBySchool(),
      getCommentsTrend(days),
      getPoiTrend(days),
      getContentBySchool(),
      getNotificationsTrend(days),
    ]);

    const rows: string[] = [];
    const push = (arr: string[]) => rows.push(arr.map(escapeCsv).join(","));
    const pushSection = (title: string) => {
      rows.push("");
      rows.push(escapeCsv(title));
    };

    push(["校园生存指北 - 数据报表", label]);
    push(["报表周期", `${startStr} 至 ${endStr}`]);
    push(["生成时间", new Date().toLocaleString("zh-CN")]);

    pushSection("一、用户增长");
    const newUsers = newUsersRes.success ? newUsersRes.data : [];
    const newUsersTotal = newUsers.reduce((s, p) => s + p.value, 0);
    push(["指标", "数值"]);
    push(["新增用户", String(newUsersTotal)]);
    push(["日均新增", String(days > 0 ? Math.round(newUsersTotal / days) : 0)]);
    if (newUsersBySchoolRes.success && newUsersBySchoolRes.data.length > 0) {
      pushSection("新增用户按学校");
      push(["学校", "新增数"]);
      newUsersBySchoolRes.data.forEach((r) => push([r.schoolName, String(r.count)]));
    }

    pushSection("二、用户留存");
    if (dauWauRes.success && dauWauRes.data.length > 0) {
      const last = dauWauRes.data[dauWauRes.data.length - 1];
      push(["指标", "数值"]);
      push(["日活 (DAU)", String(last.dau)]);
      push(["周活 (WAU)", String(last.wau)]);
      push(["月活 (MAU)", String(last.mau)]);
    }

    pushSection("三、生存集市");
    if (marketTrendRes.success && marketTrendRes.data.length > 0) {
      const trend = marketTrendRes.data;
      const newListings = trend.reduce((s, p) => s + p.newListings, 0);
      const completed = trend.reduce((s, p) => s + p.completed, 0);
      const expired = trend.reduce((s, p) => s + p.expired, 0);
      push(["指标", "数值"]);
      push(["新上架商品", String(newListings)]);
      push(["成交商品", String(completed)]);
      push(["过期商品", String(expired)]);
    }
    if (marketByTypeRes.success && marketByTypeRes.data.length > 0) {
      pushSection("在架商品按类型");
      push(["类型", "数量"]);
      marketByTypeRes.data.forEach((r) => push([r.typeName, String(r.count)]));
    }
    if (marketBySchoolRes.success && marketBySchoolRes.data.length > 0) {
      pushSection("在架商品按学校");
      push(["学校", "数量"]);
      marketBySchoolRes.data.forEach((r) => push([r.schoolName, String(r.count)]));
    }

    pushSection("四、地图与内容");
    if (commentsRes.success) {
      const commentTotal = commentsRes.data.reduce((s, p) => s + p.value, 0);
      push(["指标", "数值"]);
      push(["新增留言", String(commentTotal)]);
    }
    if (poiRes.success) {
      const poiTotal = poiRes.data.reduce((s, p) => s + p.value, 0);
      push(["新增 POI", String(poiTotal)]);
    }
    if (contentBySchoolRes.success && contentBySchoolRes.data.length > 0) {
      pushSection("各学校 POI 与留言");
      push(["学校", "POI 数", "留言数"]);
      contentBySchoolRes.data.forEach((r) =>
        push([r.schoolName, String(r.pois), String(r.comments)])
      );
    }

    pushSection("五、核心率指标");
    const statsRes = await getSuperAdminStats();
    if (statsRes.success && statsRes.data) {
      const s = statsRes.data;
      push(["指标", "数值 (%)"]);
      push(["用户活跃率 (MAU/总用户)", String(s.userActivationRate)]);
      push(["集市成交率 (成交/(成交+过期))", String(s.marketCompletionRate)]);
      push(["集市过期率 (过期/(成交+过期))", String(s.marketExpiryRate)]);
      push(["留言互动率 (有点赞/总留言)", String(s.commentEngagementRate)]);
      push(["反馈处理率 (已处理/总反馈)", String(s.feedbackResolutionRate)]);
      push(["留言举报处理率 (已审核/有举报)", String(s.commentReportResolutionRate)]);
      push(["失物招领完成率 (已找到/(已找到+已过期))", String(s.lostFoundCompletionRate)]);
    }

    pushSection("六、消息");
    if (notificationsRes.success && notificationsRes.data.length > 0) {
      const total = notificationsRes.data.reduce((s, p) => s + p.total, 0);
      const read = notificationsRes.data.reduce((s, p) => s + p.read, 0);
      const readRate = total > 0 ? Math.round((100 * read) / total) : 0;
      push(["指标", "数值"]);
      push(["发送通知", String(total)]);
      push(["已读通知", String(read)]);
      push(["已读率 (%)", String(readRate)]);
    }

    const csv = "\uFEFF" + rows.join("\r\n");
    const filename = `校园生存指北_${label}_${startStr}_${endStr}.csv`;

    return { success: true, csv, filename };
  } catch (e) {
    console.error("导出报表失败:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "导出失败",
    };
  }
}

function escapeCsv(val: string | number): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
