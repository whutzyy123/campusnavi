import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/pois/search
 * 按学校搜索 POI（用于生存集市发布等场景）
 * Query: schoolId (必填), q (搜索关键词), ongoingOnly (可选，仅返回有进行中活动的 POI)
 *
 * 匹配逻辑（优先级从高到低）：
 * - Match 1: POI.name 包含 q
 * - Match 2: POI.alias 包含 q
 * - Match 3: POI 有进行中活动，且 Activity.title 或 Activity.description 包含 q
 *
 * 若通过活动匹配，响应中附带 matchedActivity 字段，便于 UI 展示匹配原因
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const q = searchParams.get("q")?.trim();
    const ongoingOnly = searchParams.get("ongoingOnly") === "true";

    if (!schoolId?.trim()) {
      return NextResponse.json(
        { success: false, message: "schoolId 为必填项" },
        { status: 400 }
      );
    }

    const sid = schoolId.trim();
    const baseWhere = { schoolId: sid, reportCount: { lt: 3 } };
    const limit = 50;

    // 快捷筛选：仅返回有进行中活动的 POI（用于「正在进行」入口）
    if (ongoingOnly) {
      const now = new Date();
      const activities = await prisma.activity.findMany({
        where: {
          schoolId: sid,
          startAt: { lte: now },
          endAt: { gte: now },
        },
        select: {
          id: true,
          title: true,
          poiId: true,
          poi: {
            select: { id: true, name: true, alias: true, reportCount: true },
          },
        },
      });

      const seenPoiIds = new Set<string>();
      const data: Array<{
        id: string;
        name: string;
        alias: string | null;
        matchedActivity: { id: string; title: string };
      }> = [];

      for (const act of activities) {
        if (!act.poi || act.poi.reportCount >= 3) continue;
        if (seenPoiIds.has(act.poiId)) continue;
        seenPoiIds.add(act.poiId);
        data.push({
          id: act.poi.id,
          name: act.poi.name,
          alias: act.poi.alias,
          matchedActivity: { id: act.id, title: act.title },
        });
        if (data.length >= limit) break;
      }

      return NextResponse.json({ success: true, data });
    }

    // 无关键词时返回全部（保持原有行为）
    if (!q || q.length === 0) {
      const pois = await prisma.pOI.findMany({
        where: baseWhere,
        select: { id: true, name: true, alias: true },
        orderBy: { name: "asc" },
        take: limit,
      });
      return NextResponse.json({
        success: true,
        data: pois.map((p) => ({ id: p.id, name: p.name, alias: p.alias })),
      });
    }

    const now = new Date();

    // Match 1: name 包含 q（最高优先级）
    const nameMatchPois = await prisma.pOI.findMany({
      where: { ...baseWhere, name: { contains: q } },
      select: { id: true, name: true, alias: true },
      orderBy: { name: "asc" },
      take: limit,
    });
    const nameMatchIds = new Set(nameMatchPois.map((p) => p.id));

    // Match 2: alias 包含 q（排除已由 name 命中的）
    const remainingAfterName = limit - nameMatchPois.length;
    let aliasMatchPois: Array<{ id: string; name: string; alias: string | null }> = [];
    if (remainingAfterName > 0) {
      aliasMatchPois = await prisma.pOI.findMany({
        where: {
          ...baseWhere,
          id: { notIn: [...nameMatchIds] },
          alias: { contains: q },
        },
        select: { id: true, name: true, alias: true },
        orderBy: { name: "asc" },
        take: remainingAfterName,
      });
    }
    const aliasMatchIds = new Set(aliasMatchPois.map((p) => p.id));

    // Match 3: 进行中活动的 title/description 包含 q（排除已由 name/alias 命中的）
    const remainingAfterAlias = limit - nameMatchPois.length - aliasMatchPois.length;
    const activityMatchItems: Array<{
      id: string;
      name: string;
      alias: string | null;
      matchedActivity: { id: string; title: string };
    }> = [];

    if (remainingAfterAlias > 0) {
      const matchingActivities = await prisma.activity.findMany({
        where: {
          schoolId: sid,
          startAt: { lte: now },
          endAt: { gte: now },
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
          ],
        },
        include: {
          poi: {
            select: { id: true, name: true, alias: true, reportCount: true },
          },
        },
      });

      const excludeIds = new Set([...nameMatchIds, ...aliasMatchIds]);
      const seenPoiIds = new Set<string>();

      for (const act of matchingActivities) {
        if (activityMatchItems.length >= remainingAfterAlias) break;
        if (!act.poi || act.poi.reportCount >= 3) continue;
        if (excludeIds.has(act.poiId) || seenPoiIds.has(act.poiId)) continue;
        seenPoiIds.add(act.poiId);
        activityMatchItems.push({
          id: act.poi.id,
          name: act.poi.name,
          alias: act.poi.alias,
          matchedActivity: { id: act.id, title: act.title },
        });
      }
    }

    const data = [
      ...nameMatchPois.map((p) => ({ id: p.id, name: p.name, alias: p.alias })),
      ...aliasMatchPois.map((p) => ({ id: p.id, name: p.name, alias: p.alias })),
      ...activityMatchItems,
    ];

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POI 搜索失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "服务器错误",
      },
      { status: 500 }
    );
  }
}
