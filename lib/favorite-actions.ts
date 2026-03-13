"use server";

/**
 * POI 收藏 Server Actions
 */

import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

export interface FavoriteActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FavoritePOIItem {
  id: string;
  poiId: string;
  poiName: string;
  poiCategory: string;
  schoolId: string;
  schoolName: string;
  createdAt: string;
}

/**
 * 切换收藏状态：已收藏则取消，未收藏则添加
 */
export async function toggleFavorite(poiId: string): Promise<FavoriteActionResult<{ isFavorited: boolean }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: { id: true, schoolId: true, name: true },
    });
    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    const existing = await prisma.pOIFavorite.findUnique({
      where: {
        userId_poiId: { userId: auth.userId, poiId },
      },
    });

    if (existing) {
      await prisma.pOIFavorite.delete({
        where: { id: existing.id },
      });
      return { success: true, data: { isFavorited: false } };
    }

    await prisma.pOIFavorite.create({
      data: {
        userId: auth.userId,
        poiId: poi.id,
        schoolId: poi.schoolId,
      },
    });
    return { success: true, data: { isFavorited: true } };
  } catch (err) {
    console.error("toggleFavorite 失败:", err);
    return { success: false, error: "操作失败，请稍后重试" };
  }
}

/**
 * 检查当前用户是否已收藏某 POI
 */
export async function checkIsFavorite(poiId: string): Promise<FavoriteActionResult<boolean>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: true, data: false };
    }

    const fav = await prisma.pOIFavorite.findUnique({
      where: {
        userId_poiId: { userId: auth.userId, poiId },
      },
    });
    return { success: true, data: !!fav };
  } catch (err) {
    console.error("checkIsFavorite 失败:", err);
    return { success: false, error: "查询失败", data: false };
  }
}

/**
 * 获取当前用户收藏列表（分页，每页 10 条）
 */
export async function getMyFavorites(options?: {
  page?: number;
  limit?: number;
}): Promise<
  FavoriteActionResult<{
    data: FavoritePOIItem[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }>
> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 10));

    const [items, total] = await Promise.all([
      prisma.pOIFavorite.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          poi: {
            select: {
              id: true,
              name: true,
              category: true,
              schoolId: true,
              school: { select: { name: true } },
            },
          },
        },
      }),
      prisma.pOIFavorite.count({ where: { userId: auth.userId } }),
    ]);

    const data: FavoritePOIItem[] = items.map((f) => ({
      id: f.id,
      poiId: f.poi.id,
      poiName: f.poi.name,
      poiCategory: f.poi.category ?? "—",
      schoolId: f.poi.schoolId,
      schoolName: f.poi.school?.name ?? "—",
      createdAt: f.createdAt.toISOString(),
    }));

    return {
      success: true,
      data: {
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    };
  } catch (err) {
    console.error("getMyFavorites 失败:", err);
    return { success: false, error: "获取收藏列表失败" };
  }
}
