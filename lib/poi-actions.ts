"use server";

/**
 * POI 管理 Server Actions
 * 支持父子层级（Primary / Secondary POI）
 */

import { prisma } from "@/lib/prisma";
import { getMergedCategories } from "@/lib/category-utils";
import { validateContent } from "@/lib/content-validator";
import { CoordinateConverter } from "@/lib/amap-loader";
import { requireAdmin } from "@/lib/auth-server-actions";

export interface POIActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface POIListItem {
  id: string;
  schoolId: string;
  parentId: string | null;
  name: string;
  category: string;
  categoryId: string | null;
  lat: number;
  lng: number;
  isOfficial: boolean;
  description: string | null;
  imageUrl?: string | null;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
  currentStatus?: {
    statusType: string;
    val: number;
    expiresAt: string;
    sampleCount?: number;
  };
}

export interface POIDetail extends POIListItem {
  children: POIListItem[];
}

export interface GetPOIsBySchoolOptions {
  /** 仅返回根 POI（parentId 为 null），默认 false */
  rootOnly?: boolean;
  /** 分页：页码（从 1 开始） */
  page?: number;
  /** 分页：每页数量 */
  limit?: number;
}

/** POI 搜索结果项（用于搜索框、集市 POI 选择等） */
export interface POISearchItem {
  id: string;
  name: string;
  alias: string | null;
  matchedActivity?: { id: string; title: string };
}

/**
 * 按学校搜索 POI（公开）
 * - q: 关键词，匹配 name、alias、进行中活动 title/description
 * - ongoingOnly: 仅返回有进行中活动的 POI
 */
export async function searchPOIs(
  schoolId: string,
  options?: { q?: string; ongoingOnly?: boolean }
): Promise<POIActionResult<POISearchItem[]>> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "schoolId 为必填项" };
    }

    const sid = schoolId.trim();
    const q = options?.q?.trim();
    const ongoingOnly = options?.ongoingOnly ?? false;
    const baseWhere = { schoolId: sid, reportCount: { lt: 3 } };
    const limit = 50;
    const now = new Date();

    if (ongoingOnly) {
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
      const data: POISearchItem[] = [];

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

      return { success: true, data };
    }

    if (!q || q.length === 0) {
      const pois = await prisma.pOI.findMany({
        where: baseWhere,
        select: { id: true, name: true, alias: true },
        orderBy: { name: "asc" },
        take: limit,
      });
      return {
        success: true,
        data: pois.map((p) => ({ id: p.id, name: p.name, alias: p.alias })),
      };
    }

    const nameMatchPois = await prisma.pOI.findMany({
      where: { ...baseWhere, name: { contains: q } },
      select: { id: true, name: true, alias: true },
      orderBy: { name: "asc" },
      take: limit,
    });
    const nameMatchIds = new Set(nameMatchPois.map((p) => p.id));

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

    const remainingAfterAlias = limit - nameMatchPois.length - aliasMatchPois.length;
    const activityMatchItems: POISearchItem[] = [];

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

    const data: POISearchItem[] = [
      ...nameMatchPois.map((p) => ({ id: p.id, name: p.name, alias: p.alias })),
      ...aliasMatchPois.map((p) => ({ id: p.id, name: p.name, alias: p.alias })),
      ...activityMatchItems,
    ];

    return { success: true, data };
  } catch (err) {
    console.error("searchPOIs 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "POI 搜索失败",
    };
  }
}

/**
 * 举报 POI（需登录，可选匿名）
 */
export async function reportPOI(
  poiId: string,
  reason: string,
  description?: string | null
): Promise<POIActionResult<{ reportCount: number; isHidden: boolean }>> {
  try {
    const validReasons = ["定位不准", "信息错误", "有害内容"];
    if (!validReasons.includes(reason)) {
      return { success: false, error: "无效的举报原因" };
    }

    try {
      await validateContent(reason, { checkNumbers: false });
      if (description) {
        await validateContent(description, { checkNumbers: true });
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: { id: true, schoolId: true, reportCount: true },
    });

    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    const updated = await prisma.pOI.update({
      where: { id: poiId },
      data: { reportCount: { increment: 1 } },
      select: { id: true, reportCount: true },
    });

    return {
      success: true,
      data: {
        reportCount: updated.reportCount,
        isHidden: updated.reportCount >= 3,
      },
    };
  } catch (err) {
    console.error("reportPOI 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "举报失败",
    };
  }
}

/**
 * 根据学校获取 POI 列表
 * - rootOnly=true：仅返回根 POI（Primary POI）
 * - rootOnly=false：返回所有 POI，根与子 POI 均包含
 */
export async function getPOIsBySchool(
  schoolId: string,
  options?: GetPOIsBySchoolOptions
): Promise<POIActionResult<{ pois: POIListItem[]; rootPOIs?: POIListItem[]; subPOIs?: POIListItem[]; pagination?: { total: number; page: number; limit: number; totalPages: number } }>> {
  try {
    if (!schoolId) {
      return { success: false, error: "缺少必填参数：schoolId" };
    }

    const rootOnly = options?.rootOnly ?? false;
    const page = options?.page;
    const limit = options?.limit;
    const isPaginated = page != null && limit != null && page > 0 && limit > 0;

    const baseWhere = {
      schoolId,
      reportCount: { lt: 3 },
    };

    const where = rootOnly
      ? { ...baseWhere, parentId: null }
      : baseWhere;

    let pois;
    let total = 0;

    if (isPaginated) {
      const skip = (page! - 1) * limit!;
      [total, pois] = await Promise.all([
        prisma.pOI.count({ where }),
        prisma.pOI.findMany({
          where,
          select: {
            id: true,
            schoolId: true,
            parentId: true,
            name: true,
            categoryId: true,
            category: true,
            lat: true,
            lng: true,
            isOfficial: true,
            description: true,
            imageUrl: true,
            reportCount: true,
            createdAt: true,
            updatedAt: true,
            categoryRef: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit!,
        }),
      ]);
    } else {
      pois = await prisma.pOI.findMany({
        where,
        select: {
          id: true,
          schoolId: true,
          parentId: true,
          name: true,
          categoryId: true,
          category: true,
          lat: true,
          lng: true,
          isOfficial: true,
          description: true,
          imageUrl: true,
          reportCount: true,
          createdAt: true,
          updatedAt: true,
          categoryRef: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
    }

    const mergedCategories = await getMergedCategories(schoolId);
    const categoryMap = new Map(mergedCategories.map((c) => [c.id, c]));

    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const poisWithStatus = await Promise.all(
      pois.map(async (poi) => {
        const recentStatuses = await prisma.liveStatus.findMany({
          where: {
            poiId: poi.id,
            schoolId,
            expiresAt: { gt: now },
            createdAt: { gte: fifteenMinutesAgo },
          },
          select: { val: true, statusType: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });

        const { calculateStatusStatistics } = await import("@/lib/poi-utils");
        const statistics = calculateStatusStatistics(recentStatuses);

        let categoryName = poi.category || "其他";
        if (poi.categoryId) {
          const merged = categoryMap.get(poi.categoryId);
          if (merged) categoryName = merged.customName ?? merged.name;
        }

        return {
          id: poi.id,
          schoolId: poi.schoolId,
          parentId: poi.parentId,
          name: poi.name,
          category: categoryName,
          categoryId: poi.categoryId,
          lat: poi.lat,
          lng: poi.lng,
          isOfficial: poi.isOfficial,
          description: poi.description,
          imageUrl: poi.imageUrl,
          reportCount: poi.reportCount,
          createdAt: poi.createdAt.toISOString(),
          updatedAt: poi.updatedAt.toISOString(),
          currentStatus:
            recentStatuses.length > 0
              ? {
                  statusType: recentStatuses[0].statusType,
                  val: statistics.val,
                  expiresAt: recentStatuses[0].expiresAt.toISOString(),
                  sampleCount: statistics.sampleCount,
                }
              : undefined,
        };
      })
    );

    if (rootOnly) {
      return {
        success: true,
        data: {
          pois: poisWithStatus,
          rootPOIs: poisWithStatus,
          pagination: isPaginated
            ? {
                total,
                page: page!,
                limit: limit!,
                totalPages: Math.ceil(total / limit!),
              }
            : undefined,
        },
      };
    }

    const rootPOIs = poisWithStatus.filter((p) => !p.parentId);
    const subPOIs = poisWithStatus.filter((p) => p.parentId);

    return {
      success: true,
      data: {
        pois: poisWithStatus,
        rootPOIs,
        subPOIs,
        pagination: isPaginated
          ? {
              total,
              page: page!,
              limit: limit!,
              totalPages: Math.ceil(total / limit!),
            }
          : undefined,
      },
    };
  } catch (error) {
    console.error("getPOIsBySchool 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

export interface CreatePOIInput {
  schoolId: string;
  name: string;
  alias?: string | null;
  categoryId?: string | null;
  category?: string | null;
  lat: number;
  lng: number;
  description?: string | null;
  imageUrl?: string | null;
  /** 可选：父 POI ID，用于创建 Secondary POI */
  parentId?: string | null;
}

/**
 * 创建 POI（支持可选 parentId 创建子 POI）
 */
export async function createPOI(
  input: CreatePOIInput
): Promise<POIActionResult<{ poi: POIListItem }>> {
  try {
    const { schoolId, name, alias, categoryId, category, lat, lng, description, imageUrl, parentId } = input;

    if (!schoolId || !name || (categoryId == null && category == null) || lat == null || lng == null) {
      return {
        success: false,
        error: "缺少必填字段：schoolId, name, categoryId (或 category), lat, lng",
      };
    }

    let finalCategoryId: string | null = categoryId ?? null;
    let finalCategoryName: string | null = category ?? null;

    if (categoryId) {
      const cat = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, schoolId: true, name: true, isGlobal: true, isMicroCategory: true },
      });
      if (!cat) return { success: false, error: "分类不存在" };
      // isMicroCategory：便民公共设施，全平台可用
      const allowed = cat.isGlobal || cat.isMicroCategory || cat.schoolId === schoolId;
      if (!allowed) return { success: false, error: "分类无效或无权使用" };

      if (cat.isGlobal) {
        const override = await prisma.categoryOverride.findUnique({
          where: { schoolId_categoryId: { schoolId, categoryId: cat.id } },
          select: { isHidden: true },
        });
        if (override?.isHidden) return { success: false, error: "该分类已被隐藏，无法使用" };
      }
      finalCategoryId = cat.id;
      finalCategoryName = cat.name;
    } else if (category) {
      finalCategoryName = category;
    }

    try {
      CoordinateConverter.formatCoordinate(lng, lat);
    } catch {
      return { success: false, error: "坐标格式错误" };
    }

    let sanitizedName: string;
    let sanitizedDescription: string | null = null;
    let sanitizedAlias: string | null = null;
    try {
      sanitizedName = (await validateContent(name, { checkNumbers: true })).trim();
      if (description) sanitizedDescription = (await validateContent(description, { checkNumbers: true })).trim();
      if (alias) sanitizedAlias = (await validateContent(alias, { checkNumbers: true })).trim();
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return { success: false, error: "学校不存在" };

    if (parentId) {
      const parent = await prisma.pOI.findUnique({
        where: { id: parentId },
        select: { id: true, schoolId: true },
      });
      if (!parent) return { success: false, error: "父 POI 不存在" };
      if (parent.schoolId !== schoolId) return { success: false, error: "父 POI 必须属于同一学校" };
    }

    const poi = await prisma.pOI.create({
      data: {
        schoolId,
        name: sanitizedName,
        alias: sanitizedAlias || null,
        categoryId: finalCategoryId,
        category: finalCategoryName,
        lat,
        lng,
        description: sanitizedDescription || null,
        imageUrl: imageUrl?.trim() || null,
        isOfficial: true,
        reportCount: 0,
        parentId: parentId || null,
      },
      include: {
        categoryRef: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      data: {
        poi: {
          id: poi.id,
          schoolId: poi.schoolId,
          parentId: poi.parentId,
          name: poi.name,
          category: poi.categoryRef?.name || poi.category || "其他",
          categoryId: poi.categoryId,
          lat: poi.lat,
          lng: poi.lng,
          isOfficial: poi.isOfficial,
          description: poi.description,
          reportCount: poi.reportCount,
          createdAt: poi.createdAt.toISOString(),
          updatedAt: poi.updatedAt.toISOString(),
        },
      },
    };
  } catch (error) {
    console.error("createPOI 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 获取单个 POI 详情（包含 children 子 POI 列表）
 */
export async function getPOIDetail(id: string): Promise<POIActionResult<{ poi: POIDetail }>> {
  try {
    if (!id) return { success: false, error: "缺少 POI ID" };

    const poi = await prisma.pOI.findUnique({
      where: { id },
      include: {
        categoryRef: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
        children: {
          include: {
            categoryRef: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!poi) return { success: false, error: "POI 不存在" };

    const mergedCategories = await getMergedCategories(poi.schoolId);
    const categoryMap = new Map(mergedCategories.map((c) => [c.id, c]));

    type POIRow = { id: string; schoolId: string; parentId: string | null; name: string; categoryRef: { id: string; name: string } | null; category: string | null; categoryId: string | null; lat: number; lng: number; isOfficial: boolean; description: string | null; imageUrl: string | null; reportCount: number; createdAt: Date; updatedAt: Date };
    const toListItem = (p: POIRow) => ({
      id: p.id,
      schoolId: p.schoolId,
      parentId: p.parentId,
      name: p.name,
      category: p.categoryRef?.name || p.category || "其他",
      categoryId: p.categoryId,
      lat: p.lat,
      lng: p.lng,
      isOfficial: p.isOfficial,
      description: p.description,
      imageUrl: p.imageUrl,
      reportCount: p.reportCount,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    });

    const childrenList = poi.children.map((c) => toListItem(c));

    return {
      success: true,
      data: {
        poi: {
          ...toListItem(poi),
          children: childrenList,
        },
      },
    };
  } catch (error) {
    console.error("getPOIDetail 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

export interface UpdatePOIInput {
  name?: string;
  alias?: string | null;
  categoryId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  lat?: number;
  lng?: number;
  isOfficial?: boolean;
  statusOverride?: {
    val: number;
    statusType: string;
    expiresAt?: string;
  } | null;
}

/**
 * 更新 POI 信息（仅限管理员）
 */
export async function updatePOI(
  id: string,
  input: UpdatePOIInput
): Promise<POIActionResult<{ poi: POIListItem }>> {
  try {
    const auth = await requireAdmin();

    const poi = await prisma.pOI.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        name: true,
        imageUrl: true,
      },
    });

    if (!poi) return { success: false, error: "POI 不存在" };

    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== poi.schoolId) {
      return { success: false, error: "无权编辑其他学校的 POI" };
    }

    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }
    if (input.alias !== undefined) {
      updateData.alias = input.alias?.trim() || null;
    }
    if (input.categoryId !== undefined) {
      if (input.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: input.categoryId },
          select: { id: true, name: true, schoolId: true, isGlobal: true, isMicroCategory: true },
        });
        if (!category) return { success: false, error: "分类不存在" };
        // isMicroCategory：便民公共设施，全平台可用
        const isAllowed =
          category.isGlobal ||
          category.isMicroCategory ||
          category.schoolId === poi.schoolId;
        if (!isAllowed) return { success: false, error: "分类不属于该学校" };
        updateData.categoryId = input.categoryId;
        updateData.category = category.name;
      } else {
        updateData.categoryId = null;
      }
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }
    if (input.imageUrl !== undefined) {
      if (poi.imageUrl && poi.imageUrl !== input.imageUrl) {
        const { deleteImageFromStorage } = await import("@/lib/upload-actions");
        await deleteImageFromStorage(poi.imageUrl);
      }
      updateData.imageUrl = input.imageUrl?.trim() || null;
    }
    if (input.lat !== undefined && input.lng !== undefined) {
      try {
        CoordinateConverter.formatCoordinate(input.lng, input.lat);
        updateData.lat = input.lat;
        updateData.lng = input.lng;
      } catch {
        return { success: false, error: "坐标格式错误" };
      }
    }
    if (input.isOfficial !== undefined) {
      updateData.isOfficial = Boolean(input.isOfficial);
    }

    if ((updateData.name as string)?.length) {
      try {
        (updateData as Record<string, string>).name = (
          await validateContent(updateData.name as string, { checkNumbers: true })
        ).trim();
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }
    if (updateData.description !== undefined && updateData.description !== null) {
      try {
        (updateData as Record<string, string | null>).description =
          updateData.description
            ? (await validateContent(updateData.description as string, { checkNumbers: true })).trim()
            : null;
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }
    if (updateData.alias !== undefined && updateData.alias !== null) {
      try {
        (updateData as Record<string, string | null>).alias =
          updateData.alias
            ? (await validateContent(updateData.alias as string, { checkNumbers: true })).trim()
            : null;
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。",
        };
      }
    }

    const updatedPOI = await prisma.pOI.update({
      where: { id },
      data: updateData as Parameters<typeof prisma.pOI.update>[0]["data"],
      include: {
        categoryRef: { select: { id: true, name: true } },
      },
    });

    if (input.statusOverride?.val && input.statusOverride?.statusType) {
      const expiresAt = input.statusOverride.expiresAt
        ? new Date(input.statusOverride.expiresAt)
        : new Date(Date.now() + 60 * 60 * 1000);
      await prisma.liveStatus.create({
        data: {
          poiId: id,
          schoolId: poi.schoolId,
          userId: auth.userId,
          statusType: input.statusOverride.statusType,
          val: input.statusOverride.val,
          expiresAt,
        },
      });
    }

    return {
      success: true,
      data: {
        poi: {
          id: updatedPOI.id,
          schoolId: updatedPOI.schoolId,
          parentId: updatedPOI.parentId,
          name: updatedPOI.name,
          category: updatedPOI.categoryRef?.name || updatedPOI.category || "其他",
          categoryId: updatedPOI.categoryId,
          lat: updatedPOI.lat,
          lng: updatedPOI.lng,
          isOfficial: updatedPOI.isOfficial,
          description: updatedPOI.description,
          imageUrl: updatedPOI.imageUrl,
          reportCount: updatedPOI.reportCount,
          createdAt: updatedPOI.createdAt.toISOString(),
          updatedAt: updatedPOI.updatedAt.toISOString(),
        },
      },
    };
  } catch (error) {
    console.error("updatePOI 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 删除 POI（仅限管理员）
 */
export async function deletePOI(id: string): Promise<POIActionResult<void>> {
  try {
    const auth = await requireAdmin();

    const poi = await prisma.pOI.findUnique({
      where: { id },
      select: { id: true, schoolId: true, imageUrl: true },
    });

    if (!poi) return { success: false, error: "POI 不存在" };

    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== poi.schoolId) {
      return { success: false, error: "无权删除其他学校的 POI" };
    }

    if (poi.imageUrl) {
      try {
        const { deleteImageFromStorage } = await import("@/lib/upload-actions");
        await deleteImageFromStorage(poi.imageUrl);
      } catch (e) {
        console.warn("删除 POI 图片失败（继续删除 POI）:", e);
      }
    }

    await prisma.pOI.delete({ where: { id } });

    return { success: true };
  } catch (error) {
    console.error("deletePOI 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}
