"use server";

/**
 * 留言列表相关 Server Actions
 * 用户端列表查询
 */

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import type { POICommentListItem, GetPOICommentsResult } from "@/lib/comment/types";

/**
 * 获取指定 POI 的分页留言列表（用户端）
 * 支持 latest / popular 排序
 */
export async function getPOIComments(
  poiId: string,
  page = 1,
  pageSize = 20,
  sortBy: "latest" | "popular" = "latest"
): Promise<GetPOICommentsResult> {
  try {
    if (!poiId?.trim()) {
      return { success: false, error: "缺少必填参数：poiId" };
    }

    const auth = await getAuthCookie();
    const currentUserId = auth?.userId ?? null;

    const skip = (page - 1) * pageSize;
    const validSortBy = sortBy === "popular" ? "popular" : "latest";

    const topLevelOrderBy =
      validSortBy === "popular"
        ? [{ likeCount: "desc" as const }, { createdAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

    const [total, topLevelComments] = await Promise.all([
      prisma.comment.count({
        where: { poiId, parentId: null },
      }),
      prisma.comment.findMany({
        where: { poiId, parentId: null },
        orderBy: topLevelOrderBy,
        skip,
        take: pageSize,
        select: { id: true },
      }),
    ]);

    const topLevelCommentIds = topLevelComments.map((c) => c.id);

    if (topLevelCommentIds.length === 0) {
      return {
        success: true,
        comments: [],
        pagination: { page, limit: pageSize, total },
      };
    }

    const allComments = await prisma.comment.findMany({
      where: { poiId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        likeCount: true,
        reportCount: true,
        isHidden: true,
        parentId: true,
        user: {
          select: { id: true, nickname: true, avatar: true, email: true },
        },
        parent: {
          select: {
            id: true,
            user: { select: { id: true, nickname: true } },
          },
        },
        ...(currentUserId && {
          likes: {
            where: { userId: currentUserId },
            select: { id: true },
          },
        }),
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    const topLevelIdsSet = new Set(topLevelCommentIds);
    const relevantComments = allComments.filter((c) => {
      if (topLevelIdsSet.has(c.id)) return true;
      let current = c;
      const visited = new Set<string>();
      while (current.parentId) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        if (topLevelIdsSet.has(current.parentId)) return true;
        const parent = allComments.find((p) => p.id === current.parentId);
        if (!parent) break;
        current = parent;
      }
      return false;
    });

    const rawFormatted: POICommentListItem[] = relevantComments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      likeCount: c.likeCount,
      isLikedByMe:
        "likes" in c && Array.isArray(c.likes) && c.likes.length > 0,
      reportCount: c.reportCount,
      isHidden: c.isHidden,
      parentId: c.parentId,
      user: {
        id: c.user.id,
        nickname: c.user.nickname,
        avatar: c.user.avatar,
        email: c.user.email,
      },
      parent: c.parent
        ? {
            id: c.parent.id,
            user: {
              id: c.parent.user.id,
              nickname: c.parent.user.nickname,
            },
          }
        : null,
    }));

    const rootIndexMap = new Map(
      topLevelCommentIds.map((id, i) => [id, i] as const)
    );
    const getRootIndex = (c: POICommentListItem): number => {
      if (!c.parentId) return rootIndexMap.get(c.id) ?? 9999;
      const parent = rawFormatted.find((p) => p.id === c.parentId);
      return parent ? getRootIndex(parent) : 9999;
    };
    const formattedComments: POICommentListItem[] = [...rawFormatted].sort(
      (a, b) => {
        const rootA = getRootIndex(a);
        const rootB = getRootIndex(b);
        if (rootA !== rootB) return rootA - rootB;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
    );

    return {
      success: true,
      comments: formattedComments,
      pagination: { page, limit: pageSize, total },
    };
  } catch (err) {
    console.error("[getPOIComments]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取留言列表失败",
    };
  }
}
