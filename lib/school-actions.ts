"use server";

/**
 * 学校管理 Server Actions
 * - 公开接口：getSchoolsList、getSchoolById、detectSchoolByLocation（无需认证）
 * - 超级管理员专用：getSchoolsWithStats、updateSchoolStatus、deleteSchool
 */

import { booleanPointInPolygon, centroid } from "@turf/turf";
import type { Point, Polygon, Feature } from "geojson";
import { headers } from "next/headers";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { computeLabelCenter } from "@/lib/campus-label-utils";
import { deleteSchoolCascade } from "@/lib/school/delete-school-db";

/** 学校列表项（公开，用于学校切换器等） */
export interface SchoolListItem {
  id: string;
  name: string;
  schoolCode: string;
  centerLat?: number | null;
  centerLng?: number | null;
}

/** 学校详情（单校信息） */
export interface SchoolDetail {
  id: string;
  name: string;
  schoolCode: string;
  centerLat?: number | null;
  centerLng?: number | null;
  isActive: boolean;
}

/** 检测结果 */
export interface DetectSchoolResult {
  id: string;
  name: string;
  schoolCode: string;
  centerLat?: number;
  centerLng?: number;
}

export type SchoolListResult =
  | { success: true; data: SchoolListItem[] }
  | { success: false; error: string };

export type SchoolDetailResult =
  | { success: true; data: SchoolDetail }
  | { success: false; error: string };

export type DetectSchoolResultType =
  | { success: true; data: DetectSchoolResult }
  | { success: false; error: string; data?: null };

/**
 * 获取激活的学校列表（公开，用于学校切换器、登录/注册页）
 */
export async function getSchoolsList(): Promise<SchoolListResult> {
  try {
    const ip = getClientIpFromHeaders(headers());
    const ok = await consumeRateLimit(`schools:list:ip:${ip}`, 120, 60 * 1000);
    if (!ok) {
      return { success: false, error: "请求过于频繁，请稍后再试" };
    }

    const schools = await prisma.school.findMany({
      where: {
        isActive: true,
        schoolCode: { not: "system" },
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        centerLat: true,
        centerLng: true,
      },
      orderBy: { name: "asc" },
      take: 200,
    });

    return {
      success: true,
      data: schools.map((s) => ({
        id: s.id,
        name: s.name,
        schoolCode: s.schoolCode,
        centerLat: s.centerLat,
        centerLng: s.centerLng,
      })),
    };
  } catch (err) {
    console.error("getSchoolsList 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取学校列表失败",
    };
  }
}

/**
 * 获取单个学校信息（公开，用于管理员租户锁定等）
 */
export async function getSchoolById(schoolId: string): Promise<SchoolDetailResult> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "学校 ID 不能为空" };
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId.trim() },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        centerLat: true,
        centerLng: true,
        isActive: true,
      },
    });

    if (!school) {
      return { success: false, error: "学校不存在" };
    }

    return {
      success: true,
      data: {
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
        centerLat: school.centerLat,
        centerLng: school.centerLng,
        isActive: school.isActive,
      },
    };
  } catch (err) {
    console.error("getSchoolById 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取学校信息失败",
    };
  }
}

/**
 * 根据经纬度检测用户所属学校（公开，基于 CampusArea 边界）
 */
export async function detectSchoolByLocation(
  lat: number,
  lng: number
): Promise<DetectSchoolResultType> {
  try {
    if (typeof lat !== "number" || typeof lng !== "number") {
      return { success: false, error: "缺少必填参数：lat 和 lng" };
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return { success: false, error: "坐标格式错误" };
    }
    if (lng < 73 || lng > 135 || lat < 3 || lat > 54) {
      return { success: false, error: "坐标超出有效范围" };
    }

    const schools = await prisma.school.findMany({
      where: { isActive: true },
      take: 200,
      select: {
        id: true,
        name: true,
        schoolCode: true,
        centerLat: true,
        centerLng: true,
        campusAreas: {
          select: { id: true, name: true, boundary: true, center: true },
        },
      },
    });

    if (schools.length === 0) {
      return { success: false, error: "系统中暂无学校数据" };
    }

    const userPoint: Point = {
      type: "Point",
      coordinates: [lng, lat],
    };
    const userPointFeature: Feature<Point> = {
      type: "Feature",
      geometry: userPoint,
      properties: {},
    };

    for (const school of schools) {
      for (const campus of school.campusAreas) {
        try {
          const boundary = campus.boundary as unknown;
          if (!boundary || (boundary as { type?: string }).type !== "Polygon") {
            continue;
          }
          const isInside = booleanPointInPolygon(userPointFeature, boundary as Polygon);
          if (isInside) {
            const center = campus.center as [number, number] | null;
            const centerLng = center?.[0] ?? school.centerLng;
            const centerLat = center?.[1] ?? school.centerLat;
            return {
              success: true,
              data: {
                id: school.id,
                name: school.name,
                schoolCode: school.schoolCode,
                centerLat: centerLat ?? undefined,
                centerLng: centerLng ?? undefined,
              },
            };
          }
        } catch {
          continue;
        }
      }
    }

    return {
      success: false,
      error: "未找到匹配的学校，您可能不在任何校区范围内",
    };
  } catch (err) {
    console.error("detectSchoolByLocation 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "检测学校失败",
    };
  }
}

/** 校区项 */
export interface CampusAreaItem {
  id: string;
  schoolId: string;
  name: string;
  boundary: unknown;
  center: unknown;
  labelCenter?: unknown;
  createdAt: string;
  updatedAt: string;
}

export type GetCampusesResult =
  | { success: true; data: CampusAreaItem[] }
  | { success: false; error: string };

/**
 * 获取指定学校的校区列表（公开）
 */
export async function getCampuses(schoolId: string): Promise<GetCampusesResult> {
  try {
    if (!schoolId?.trim()) {
      return { success: false, error: "缺少学校ID" };
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId.trim() },
      select: { id: true },
    });
    if (!school) {
      return { success: false, error: "学校不存在" };
    }

    const campuses = await prisma.campusArea.findMany({
      where: { schoolId: schoolId.trim() },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      data: campuses.map((c) => ({
        id: c.id,
        schoolId: c.schoolId,
        name: c.name,
        boundary: c.boundary,
        center: c.center,
        labelCenter: c.labelCenter,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("getCampuses 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取校区列表失败",
    };
  }
}

/**
 * 创建校区（需 Admin 权限，Staff 不可）
 */
export async function createCampus(input: {
  schoolId: string;
  name: string;
  boundary: [number, number][];
}): Promise<{ success: boolean; data?: CampusAreaItem; error?: string }> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "STAFF") {
      return { success: false, error: "工作人员无权修改校区边界数据。" };
    }

    const { schoolId, name, boundary } = input;
    let targetSchoolId = schoolId;

    if (auth.role !== "SUPER_ADMIN") {
      if (!auth.schoolId || auth.schoolId !== schoolId) {
        return { success: false, error: "无权为其他学校创建校区" };
      }
      targetSchoolId = auth.schoolId;
    }

    if (!name?.trim()) return { success: false, error: "校区名称不能为空" };
    if (!boundary || !Array.isArray(boundary) || boundary.length < 3) {
      return { success: false, error: "边界至少需要3个点" };
    }

    for (const point of boundary) {
      if (!Array.isArray(point) || point.length !== 2) {
        return { success: false, error: "边界坐标格式错误，应为 [lng, lat] 数组" };
      }
      const [lng, lat] = point;
      if (typeof lng !== "number" || typeof lat !== "number" || Number.isNaN(lng) || Number.isNaN(lat)) {
        return { success: false, error: "坐标必须是有效的数字" };
      }
    }

    const closedBoundary = [...boundary, boundary[0]];
    const polygon: Polygon = {
      type: "Polygon",
      coordinates: [closedBoundary],
    };
    const polygonFeature: Feature<Polygon> = {
      type: "Feature",
      geometry: polygon,
      properties: {},
    };
    const centerPt = centroid(polygonFeature);
    const [centerLng, centerLat] = centerPt.geometry.coordinates;
    const centerPoint: [number, number] = [centerLng, centerLat];
    const labelCenterPoint = computeLabelCenter(closedBoundary);

    const campus = await prisma.campusArea.create({
      data: {
        schoolId: targetSchoolId,
        name: name.trim(),
        boundary: polygon as object,
        center: centerPoint as object,
        labelCenter: labelCenterPoint as object,
      },
    });

    return {
      success: true,
      data: {
        id: campus.id,
        schoolId: campus.schoolId,
        name: campus.name,
        boundary: campus.boundary,
        center: campus.center,
        labelCenter: campus.labelCenter,
        createdAt: campus.createdAt.toISOString(),
        updatedAt: campus.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("createCampus 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建校区失败",
    };
  }
}

/**
 * 更新校区（需 Admin 权限）
 */
export async function updateCampus(
  campusId: string,
  updates: { name?: string; boundary?: [number, number][] }
): Promise<{ success: boolean; data?: CampusAreaItem; error?: string }> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "STAFF") {
      return { success: false, error: "工作人员无权修改校区边界数据。" };
    }

    const campus = await prisma.campusArea.findUnique({
      where: { id: campusId },
    });
    if (!campus) return { success: false, error: "校区不存在" };
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== campus.schoolId) {
      return { success: false, error: "无权修改其他学校的校区" };
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      if (!updates.name?.trim()) return { success: false, error: "校区名称不能为空" };
      updateData.name = updates.name.trim();
    }
    if (updates.boundary !== undefined) {
      if (!Array.isArray(updates.boundary) || updates.boundary.length < 3) {
        return { success: false, error: "边界至少需要3个点" };
      }
      for (const point of updates.boundary) {
        if (!Array.isArray(point) || point.length !== 2) {
          return { success: false, error: "边界坐标格式错误" };
        }
      }
      const closedBoundary = [...updates.boundary, updates.boundary[0]];
      const polygon: Polygon = {
        type: "Polygon",
        coordinates: [closedBoundary],
      };
      const polygonFeature: Feature<Polygon> = {
        type: "Feature",
        geometry: polygon,
        properties: {},
      };
      const centerPt = centroid(polygonFeature);
      const [centerLng, centerLat] = centerPt.geometry.coordinates;
      updateData.boundary = polygon;
      updateData.center = [centerLng, centerLat];
      updateData.labelCenter = computeLabelCenter(closedBoundary);
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "没有要更新的数据" };
    }

    const updated = await prisma.campusArea.update({
      where: { id: campusId },
      data: updateData,
    });

    return {
      success: true,
      data: {
        id: updated.id,
        schoolId: updated.schoolId,
        name: updated.name,
        boundary: updated.boundary,
        center: updated.center,
        labelCenter: updated.labelCenter,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("updateCampus 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新校区失败",
    };
  }
}

/**
 * 删除校区（需 Admin 权限）
 */
export async function deleteCampus(campusId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "STAFF") {
      return { success: false, error: "工作人员无权修改校区边界数据。" };
    }

    const campus = await prisma.campusArea.findUnique({
      where: { id: campusId },
    });
    if (!campus) return { success: false, error: "校区不存在" };
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== campus.schoolId) {
      return { success: false, error: "无权删除其他学校的校区" };
    }

    await prisma.campusArea.delete({ where: { id: campusId } });
    return { success: true };
  } catch (err) {
    console.error("deleteCampus 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除校区失败",
    };
  }
}

export interface SchoolWithStats {
  id: string;
  name: string;
  schoolCode: string;
  isActive: boolean;
  userCount: number;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 获取所有学校列表（含用户数、POI 数）
 * 不按用户数过滤，确保 0 用户的学校也会返回（Left Join 语义）
 */
export async function getSchoolsWithStats(): Promise<
  { success: true; data: SchoolWithStats[] } | { success: false; error: string }
> {
  try {
    const schools = await prisma.school.findMany({
      where: {
        schoolCode: { not: "system" },
      },
      take: 200,
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { users: true, pois: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: schools.map((s) => ({
        id: s.id,
        name: s.name,
        schoolCode: s.schoolCode,
        isActive: s.isActive,
        userCount: s._count.users,
        poiCount: s._count.pois,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("getSchoolsWithStats 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取学校列表失败",
    };
  }
}

export type SchoolStatus = "ACTIVE" | "INACTIVE";

export interface SchoolActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 校验当前用户是否为超级管理员（role === 4）
 */
async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });

  if (!user) {
    return { ok: false, error: "用户不存在" };
  }

  if (user.role !== 4) {
    return { ok: false, error: "权限不足，仅超级管理员可执行此操作" };
  }

  return { ok: true, userId: auth.userId };
}

/**
 * 更新学校信息（名称等）
 * 超级管理员专用
 */
export async function updateSchool(
  schoolId: string,
  input: { name: string }
): Promise<SchoolActionResult> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    if (!input.name?.trim()) {
      return { success: false, error: "学校名称不能为空" };
    }

    const school = await prisma.school.update({
      where: { id: schoolId },
      data: { name: input.name.trim() },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: {
        ...school,
        createdAt: school.createdAt.toISOString(),
        updatedAt: school.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("updateSchool 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新学校信息失败",
    };
  }
}

/**
 * 创建学校
 * 超级管理员专用
 */
export async function createSchool(input: {
  name: string;
  schoolCode: string;
}): Promise<SchoolActionResult & { data?: { id: string; name: string; schoolCode: string } }> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    const name = input.name?.trim();
    const schoolCode = input.schoolCode?.trim();
    if (!name || !schoolCode) {
      return { success: false, error: "请填写学校名称和代码" };
    }

    const existing = await prisma.school.findUnique({
      where: { schoolCode },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "学校代码已存在" };
    }

    const school = await prisma.school.create({
      data: { name, schoolCode },
      select: { id: true, name: true, schoolCode: true },
    });

    return {
      success: true,
      data: {
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
      },
    };
  } catch (err) {
    console.error("createSchool 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建学校失败",
    };
  }
}

/**
 * 切换学校状态（ACTIVE / INACTIVE）
 * 超级管理员专用
 */
export async function updateSchoolStatus(
  schoolId: string,
  status: SchoolStatus
): Promise<SchoolActionResult> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return { success: false, error: "无效的状态，必须是 ACTIVE 或 INACTIVE" };
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, isActive: true },
    });

    if (!school) {
      return { success: false, error: "学校不存在" };
    }

    const isActive = status === "ACTIVE";

    const updated = await prisma.school.update({
      where: { id: schoolId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: {
        ...updated,
        status: updated.isActive ? "ACTIVE" : "INACTIVE",
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("updateSchoolStatus 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新学校状态失败",
    };
  }
}

/**
 * 永久删除学校
 * 超级管理员专用
 * Prisma 已配置 onDelete: Cascade，删除 School 时会自动级联删除：
 * - CampusArea, User, POI, RouteEdge, LiveStatus, InvitationCode, Comment, Category, CategoryOverride
 */
export async function deleteSchool(schoolId: string): Promise<SchoolActionResult> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, schoolCode: true },
    });

    if (!school) {
      return { success: false, error: "学校不存在" };
    }

    await deleteSchoolCascade(schoolId);

    return {
      success: true,
      data: {
        message: `学校 "${school.name}" (${school.schoolCode}) 及其所有关联数据已永久删除`,
        deletedId: school.id,
      },
    };
  } catch (err) {
    console.error("deleteSchool 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除学校失败",
    };
  }
}

export { deleteSchoolCascade } from "@/lib/school/delete-school-db";
