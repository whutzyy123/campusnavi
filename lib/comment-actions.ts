"use server";

/**
 * 留言相关 Server Actions
 * 点赞、排序、快捷回复、审核等
 */

import { prisma } from "@/lib/prisma";
import { getAuthCookie, requireAdmin } from "@/lib/auth-server-actions";
import { createNotification, markAsRead } from "@/lib/notification-actions";
import { validateContent } from "@/lib/content-validator";
import { NotificationType, NotificationEntityType } from "@prisma/client";

export interface SubmitQuickReplyResult {
  success: boolean;
  error?: string;
}

export interface ToggleLikeResult {
  success: boolean;
  isLiked?: boolean;
  newCount?: number;
  error?: string;
}

/** POI 留言列表项（用户端） */
export interface POICommentListItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  reportCount: number;
  isHidden: boolean;
  parentId: string | null;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    email?: string | null;
  };
  parent: {
    id: string;
    user: { id: string; nickname: string | null };
  } | null;
}

/** 获取 POI 留言列表结果 */
export interface GetPOICommentsResult {
  success: boolean;
  comments?: POICommentListItem[];
  pagination?: { page: number; limit: number; total: number };
  error?: string;
}

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

/** 创建留言结果 */
export interface CreateCommentResult {
  success: boolean;
  comment?: {
    id: string;
    content: string;
    createdAt: string;
    reportCount: number;
    isHidden: boolean;
    parentId: string | null;
    user: { id: string; nickname: string | null; avatar: string | null };
    parent: {
      id: string;
      user: { id: string; nickname: string | null };
    } | null;
  };
  error?: string;
}

/**
 * 创建留言或回复（用户端）
 * 含敏感词校验、多租户校验、回复通知
 */
export async function createComment(data: {
  poiId: string;
  content: string;
  parentId?: string | null;
}): Promise<CreateCommentResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "未登录用户不能发表评论" };
    }

    const { poiId, content, parentId } = data;

    if (!poiId?.trim() || !content?.toString().trim()) {
      return { success: false, error: "缺少必填字段：poiId 或 content" };
    }

    let normalizedContent = content.toString().trim();
    if (normalizedContent.length > 500) {
      return { success: false, error: "留言内容过长（最多 500 字）" };
    }

    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: { id: true, schoolId: true },
    });

    if (!poi) {
      return { success: false, error: "POI 不存在" };
    }

    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.schoolId &&
      auth.schoolId !== poi.schoolId
    ) {
      return { success: false, error: "无权对其他学校的 POI 发表评论" };
    }

    let parentComment: { id: string; userId: string } | null = null;

    if (parentId?.trim()) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          poiId: true,
          schoolId: true,
          userId: true,
        },
      });
      parentComment = parent;

      if (!parent) {
        return { success: false, error: "父留言不存在" };
      }

      if (parent.poiId !== poiId) {
        return { success: false, error: "父留言与当前 POI 不匹配" };
      }

      if (parent.schoolId !== poi.schoolId) {
        return { success: false, error: "父留言与当前 POI 不属于同一学校" };
      }
    }

    try {
      normalizedContent = await validateContent(normalizedContent, {
        checkNumbers: true,
      });
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "内容包含敏感词汇，请修改后重试。",
      };
    }

    const comment = await prisma.comment.create({
      data: {
        content: normalizedContent,
        poiId: poi.id,
        schoolId: poi.schoolId,
        userId: auth.userId,
        parentId: parentId?.trim() || null,
      },
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true },
        },
        parent: {
          select: {
            id: true,
            user: { select: { id: true, nickname: true } },
          },
        },
      },
    });

    if (
      parentId &&
      parentComment &&
      parentComment.userId !== auth.userId
    ) {
      const messagePreview =
        normalizedContent.length > 80
          ? `${normalizedContent.slice(0, 80)}...`
          : normalizedContent;
      await notifyCommentReply(
        parentComment.userId,
        auth.userId,
        comment.id,
        messagePreview
      );
    }

    return {
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        reportCount: comment.reportCount,
        isHidden: comment.isHidden,
        parentId: comment.parentId,
        user: {
          id: comment.user.id,
          nickname: comment.user.nickname,
          avatar: comment.user.avatar,
        },
        parent: comment.parent
          ? {
              id: comment.parent.id,
              user: {
                id: comment.parent.user.id,
                nickname: comment.parent.user.nickname,
              },
            }
          : null,
      },
    };
  } catch (err) {
    console.error("[createComment]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建留言失败",
    };
  }
}

/**
 * 快捷回复：从中控台消息 Tab 直接回复
 * - 创建留言
 * - 通知被回复者
 * - 将原通知标记为已读
 */
export async function submitQuickReply(
  poiId: string,
  parentId: string,
  content: string,
  notificationId: string
): Promise<SubmitQuickReplyResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "请先登录后再回复" };
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      return { success: false, error: "回复内容不能为空" };
    }
    if (trimmed.length > 500) {
      return { success: false, error: "回复内容最多 500 字" };
    }

    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: { id: true, schoolId: true },
    });
    if (!poi) {
      return { success: false, error: "地点不存在" };
    }

    const parentComment = await prisma.comment.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        poiId: true,
        schoolId: true,
        userId: true,
      },
    });
    if (!parentComment || parentComment.poiId !== poiId) {
      return { success: false, error: "父留言不存在或与地点不匹配" };
    }

    if (
      auth.schoolId !== null &&
      auth.schoolId !== poi.schoolId
    ) {
      return { success: false, error: "无权对该地点发表评论" };
    }

    let normalizedContent: string;
    try {
      normalizedContent = await validateContent(trimmed, { checkNumbers: true });
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "内容包含敏感词汇，请修改后重试",
      };
    }

    const comment = await prisma.comment.create({
      data: {
        content: normalizedContent,
        poiId: poi.id,
        schoolId: poi.schoolId,
        userId: auth.userId,
        parentId: parentId,
      },
    });

    const messagePreview =
      normalizedContent.length > 80
        ? `${normalizedContent.slice(0, 80)}...`
        : normalizedContent;
    await notifyCommentReply(
      parentComment.userId,
      auth.userId,
      comment.id,
      messagePreview
    );

    if (notificationId?.trim()) {
      await markAsRead(notificationId);
    }

    return { success: true };
  } catch (err) {
    console.error("[submitQuickReply]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "回复失败，请重试",
    };
  }
}

/**
 * 回复留言时通知原留言作者（由 API route 调用）
 * 不通知自己
 */
export async function notifyCommentReply(
  parentAuthorId: string,
  actorId: string,
  newCommentId: string,
  messagePreview: string | null
): Promise<void> {
  if (parentAuthorId === actorId) return;
  await createNotification(
    parentAuthorId,
    actorId,
    NotificationType.REPLY,
    newCommentId,
    NotificationEntityType.COMMENT,
    messagePreview
  );
}

/**
 * 切换留言点赞状态
 * - 已点赞则取消，未点赞则添加
 * - 在事务中同时更新 CommentLike 和 Comment.likeCount
 */
export async function toggleCommentLike(commentId: string): Promise<ToggleLikeResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "请先登录后再点赞" };
    }

    if (!commentId?.trim()) {
      return { success: false, error: "commentId 为必填项" };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId.trim() },
      select: { id: true, schoolId: true, likeCount: true, userId: true },
    });

    if (!comment) {
      return { success: false, error: "留言不存在" };
    }

    // 多租户校验：非超级管理员只能操作本校留言
    if (auth.schoolId !== null && auth.schoolId !== comment.schoolId) {
      return { success: false, error: "无权操作该留言" };
    }

    const existingLike = await prisma.commentLike.findUnique({
      where: {
        userId_commentId: {
          userId: auth.userId,
          commentId: comment.id,
        },
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      if (existingLike) {
        await tx.commentLike.delete({
          where: { id: existingLike.id },
        });
        const updated = await tx.comment.update({
          where: { id: comment.id },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
        return { isLiked: false, newCount: Math.max(0, updated.likeCount) };
      } else {
        await tx.commentLike.create({
          data: {
            userId: auth!.userId,
            commentId: comment.id,
          },
        });
        const updated = await tx.comment.update({
          where: { id: comment.id },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
        return { isLiked: true, newCount: updated.likeCount };
      }
    });

    // 点赞时通知留言作者（每人每留言仅通知一次，避免重复）
    if (result.isLiked && comment.userId !== auth.userId) {
      const existingNotify = await prisma.notification.findFirst({
        where: {
          userId: comment.userId,
          actorId: auth.userId,
          entityId: comment.id,
          type: "LIKE",
        },
      });
      if (!existingNotify) {
        await createNotification(
          comment.userId,
          auth.userId,
          NotificationType.LIKE,
          comment.id,
          NotificationEntityType.COMMENT,
          null
        );
      }
    }

    return {
      success: true,
      isLiked: result.isLiked,
      newCount: result.newCount,
    };
  } catch (err) {
    console.error("[toggleCommentLike]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/** 删除留言结果（用户自删或管理员删） */
export interface DeleteCommentResult {
  success: boolean;
  error?: string;
}

/**
 * 删除留言：仅作者本人 / 校管理员 / 超级管理员
 * 作者自删：未被举报则物理删除；已被举报则软删除（内容替换为 [该留言已删除]）
 * 管理员删除：物理删除
 */
export async function deleteComment(commentId: string): Promise<DeleteCommentResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "未登录用户无权删除留言" };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId.trim() },
      select: {
        id: true,
        userId: true,
        schoolId: true,
        reportCount: true,
      },
    });

    if (!comment) {
      return { success: false, error: "留言不存在" };
    }

    const isAuthor = comment.userId === auth.userId;
    const isSchoolAdminOrStaff =
      (auth.role === "ADMIN" || auth.role === "STAFF") &&
      !!auth.schoolId &&
      auth.schoolId === comment.schoolId;

    if (!isAuthor && !isSchoolAdminOrStaff) {
      return { success: false, error: "无权删除该留言" };
    }

    if (isAuthor) {
      if (comment.reportCount === 0) {
        await prisma.comment.delete({ where: { id: comment.id } });
      } else {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { content: "[该留言已删除]", isHidden: true },
        });
      }
    } else {
      await prisma.comment.delete({ where: { id: comment.id } });
    }

    return { success: true };
  } catch (err) {
    console.error("[deleteComment]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

/** 举报留言结果 */
export interface ReportCommentResult {
  success: boolean;
  reportCount?: number;
  isHidden?: boolean;
  isAutoHidden?: boolean;
  message?: string;
  error?: string;
}

/**
 * 举报留言：登录用户可用，达到 5 次自动隐藏
 */
export async function reportComment(commentId: string): Promise<ReportCommentResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "未登录用户不能举报留言" };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId.trim() },
      select: { id: true, schoolId: true, isHidden: true, reportCount: true },
    });

    if (!comment) {
      return { success: false, error: "留言不存在" };
    }

    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容举报" };
    }
    if (auth.schoolId && auth.schoolId !== comment.schoolId) {
      return { success: false, error: "无权举报其他学校的留言" };
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.comment.update({
        where: { id: comment.id },
        data: { reportCount: { increment: 1 } },
        select: { id: true, reportCount: true, isHidden: true },
      });

      let finalIsHidden = updated.isHidden;
      if (updated.reportCount >= 5 && !updated.isHidden) {
        await tx.comment.update({
          where: { id: updated.id },
          data: { isHidden: true },
        });
        finalIsHidden = true;
      }

      return {
        reportCount: updated.reportCount,
        isHidden: finalIsHidden,
        isAutoHidden: updated.reportCount >= 5 && !comment.isHidden,
      };
    });

    let message = "举报已收到，管理员将进行审核";
    if (result.isAutoHidden) {
      message = "该内容已被众包屏蔽（举报次数达到5次）";
    } else if (result.reportCount === 4) {
      message = "举报已收到，再收到1次举报将自动屏蔽";
    }

    return {
      success: true,
      reportCount: result.reportCount,
      isHidden: result.isHidden,
      isAutoHidden: result.isAutoHidden,
      message,
    };
  } catch (err) {
    console.error("[reportComment]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "举报失败",
    };
  }
}

/** 审核留言列表项 */
export interface AuditCommentItem {
  id: string;
  content: string;
  createdAt: string;
  reportCount: number;
  isHidden: boolean;
  isReviewed: boolean;
  reviewedAt: string | null;
  reviewer: { id: string; nickname: string | null; email: string | null } | null;
  user: { id: string; nickname: string | null; email: string | null; avatar: string | null };
  poi: { id: string; name: string; category: string };
}

/** 审核留言数量 */
export interface AuditCommentCountsResult {
  success: boolean;
  pending?: number;
  processed?: number;
  error?: string;
}

/** 学校留言管理查询参数 */
export interface GetSchoolCommentsParams {
  poiId?: string | null;
  userId?: string | null;
  status?: "visible" | "hidden" | null; // visible: isHidden=false, hidden: isHidden=true
  isReviewed?: boolean | null;
  search?: string | null; // 按 POI 名称或用户昵称模糊搜索
  page?: number;
  limit?: number;
}

/** 学校留言列表项 */
export interface SchoolCommentItem {
  id: string;
  content: string;
  createdAt: string;
  isHidden: boolean;
  isReviewed: boolean;
  reportCount: number;
  likeCount: number;
  parentId: string | null;
  user: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  poi: { id: string; name: string; category: string | null };
}

/** 学校留言列表返回 */
export interface GetSchoolCommentsResult {
  success: boolean;
  data?: SchoolCommentItem[];
  pagination?: { total: number; pageCount: number; currentPage: number; limit: number };
  error?: string;
}

/** 学校留言详情（含父留言） */
export interface SchoolCommentDetailItem extends SchoolCommentItem {
  parent?: {
    id: string;
    content: string;
    createdAt: string;
    isHidden: boolean;
    user: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  } | null;
}

/** 学校留言详情返回 */
export interface GetSchoolCommentDetailResult {
  success: boolean;
  data?: SchoolCommentDetailItem;
  error?: string;
}

/**
 * 获取本校全部留言（管理员/工作人员，用于管理概览）
 * 严格按 schoolId 隔离，支持 poiId、userId、status、isReviewed 筛选
 */
export async function getSchoolComments(
  params: GetSchoolCommentsParams = {}
): Promise<GetSchoolCommentsResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: {
      schoolId: string;
      poiId?: string;
      userId?: string;
      isHidden?: boolean;
      isReviewed?: boolean;
    } = {
      schoolId: auth.schoolId,
    };

    if (params.poiId?.trim()) {
      where.poiId = params.poiId.trim();
    }
    if (params.userId?.trim()) {
      where.userId = params.userId.trim();
    }
    if (params.status === "visible") {
      where.isHidden = false;
    } else if (params.status === "hidden") {
      where.isHidden = true;
    }
    if (params.isReviewed === true) {
      where.isReviewed = true;
    } else if (params.isReviewed === false) {
      where.isReviewed = false;
    }

    const search = params.search?.trim();
    const searchFilter = search
      ? {
          OR: [
            { poi: { name: { contains: search } } },
            { user: { nickname: { contains: search } } },
          ],
        }
      : {};

    const fullWhere = { ...where, ...searchFilter };

    const [total, comments] = await Promise.all([
      prisma.comment.count({ where: fullWhere }),
      prisma.comment.findMany({
        where: fullWhere,
        select: {
          id: true,
          content: true,
          createdAt: true,
          isHidden: true,
          isReviewed: true,
          reportCount: true,
          likeCount: true,
          parentId: true,
          user: {
            select: { id: true, nickname: true, avatar: true, email: true },
          },
          poi: {
            select: { id: true, name: true, category: true },
          },
        },
        orderBy: { createdAt: "desc" as const },
        skip,
        take: limit,
      }),
    ]);

    const pageCount = Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        isHidden: c.isHidden,
        isReviewed: c.isReviewed,
        reportCount: c.reportCount,
        likeCount: c.likeCount,
        parentId: c.parentId,
        user: c.user,
        poi: c.poi,
      })),
      pagination: { total, pageCount, currentPage: page, limit },
    };
  } catch (err) {
    console.error("[getSchoolComments]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取留言列表失败",
    };
  }
}

/**
 * 获取本校单条留言详情（含父留言，用于管理详情弹窗）
 */
export async function getSchoolCommentDetail(
  commentId: string
): Promise<GetSchoolCommentDetailResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId.trim(),
        schoolId: auth.schoolId,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        isHidden: true,
        isReviewed: true,
        reportCount: true,
        likeCount: true,
        parentId: true,
        user: {
          select: { id: true, nickname: true, avatar: true, email: true },
        },
        poi: {
          select: { id: true, name: true, category: true },
        },
        parent: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            isHidden: true,
            user: {
              select: { id: true, nickname: true, avatar: true, email: true },
            },
          },
        },
      },
    });

    if (!comment) {
      return { success: false, error: "留言不存在或无权查看" };
    }

    return {
      success: true,
      data: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        isHidden: comment.isHidden,
        isReviewed: comment.isReviewed,
        reportCount: comment.reportCount,
        likeCount: comment.likeCount,
        parentId: comment.parentId,
        user: comment.user,
        poi: comment.poi,
        parent: comment.parent
          ? {
              id: comment.parent.id,
              content: comment.parent.content,
              createdAt: comment.parent.createdAt.toISOString(),
              isHidden: comment.parent.isHidden,
              user: comment.parent.user,
            }
          : null,
      },
    };
  } catch (err) {
    console.error("[getSchoolCommentDetail]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取留言详情失败",
    };
  }
}

/** 审核留言列表返回 */
export interface GetAuditCommentsResult {
  success: boolean;
  data?: AuditCommentItem[];
  pagination?: { total: number; pageCount: number; currentPage: number };
  error?: string;
}

/**
 * 获取审核留言数量（待处理、已处理）
 */
export async function getAuditCommentCounts(): Promise<AuditCommentCountsResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const [pending, processed] = await Promise.all([
      prisma.comment.count({
        where: {
          schoolId: auth.schoolId,
          reportCount: { gte: 3 },
          isReviewed: false,
        },
      }),
      prisma.comment.count({
        where: {
          schoolId: auth.schoolId,
          isReviewed: true,
        },
      }),
    ]);

    return { success: true, pending, processed };
  } catch (err) {
    console.error("[getAuditCommentCounts]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取数量失败",
    };
  }
}

/**
 * 获取审核留言列表（管理员/工作人员，仅本校）
 * @param filter - pending: reportCount>=3 且未审核；processed: 已审核
 */
export async function getAuditComments(
  filter: "pending" | "processed" = "pending",
  page = 1,
  limit = 10
): Promise<GetAuditCommentsResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const skip = (page - 1) * limit;

    const where = {
      schoolId: auth.schoolId,
      ...(filter === "pending"
        ? { reportCount: { gte: 3 }, isReviewed: false }
        : { isReviewed: true }),
    };

    const [total, comments] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        select: {
          id: true,
          content: true,
          createdAt: true,
          reportCount: true,
          isHidden: true,
          isReviewed: true,
          reviewedAt: true,
          reviewer: {
            select: { id: true, nickname: true, email: true },
          },
          user: {
            select: { id: true, nickname: true, email: true, avatar: true },
          },
          poi: {
            select: { id: true, name: true, category: true },
          },
        },
        orderBy:
          filter === "pending"
            ? { reportCount: "desc" as const }
            : { reviewedAt: "desc" as const },
        skip,
        take: limit,
      }),
    ]);

    const pageCount = Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        reportCount: c.reportCount,
        isHidden: c.isHidden,
        isReviewed: c.isReviewed,
        reviewedAt: c.reviewedAt?.toISOString() ?? null,
        reviewer: c.reviewer,
        user: c.user,
        poi: { ...c.poi, category: c.poi.category ?? "" },
      })),
      pagination: { total, pageCount, currentPage: page },
    };
  } catch (err) {
    console.error("[getAuditComments]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取审核留言列表失败",
    };
  }
}

/** 审核操作结果 */
export interface ReviewCommentResult {
  success: boolean;
  error?: string;
}

/**
 * 审核留言：恢复或隐藏
 * 管理员操作后设置 isReviewed=true、reviewedAt、reviewedBy
 */
export async function reviewComment(
  commentId: string,
  action: "RESTORE" | "HIDE"
): Promise<ReviewCommentResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId.trim() },
      select: { id: true, schoolId: true },
    });

    if (!comment) {
      return { success: false, error: "留言不存在" };
    }

    if (comment.schoolId !== auth.schoolId) {
      return { success: false, error: "无权操作其他学校的留言" };
    }

    const now = new Date();
    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        isHidden: action === "HIDE",
        ...(action === "RESTORE" ? { reportCount: 0 } : {}),
        isReviewed: true,
        reviewedAt: now,
        reviewedBy: auth.userId,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[reviewComment]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/** 永久删除结果 */
export interface HardDeleteCommentResult {
  success: boolean;
  error?: string;
}

/** 批量永久删除结果 */
export interface HardDeleteCommentsResult {
  success: boolean;
  deleted?: number;
  error?: string;
}

/** 创建留言审计日志（事务内传入 tx） */
async function createCommentLog(
  commentId: string,
  userId: string,
  actionType: "HARD_DELETED",
  details?: string | null,
  tx?: unknown
) {
  const client = (tx ?? prisma) as typeof prisma;
  await client.commentLog.create({
    data: { commentId, userId, actionType, details: details ?? null },
  });
}

/**
 * 永久删除留言（物理删除）
 * 安全校验：仅校级管理员/工作人员，同校，且 isReviewed === true
 * 删除前写入 CommentLog 审计
 */
export async function hardDeleteComment(commentId: string): Promise<HardDeleteCommentResult> {
  try {
    const auth = await requireAdmin();

    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId.trim() },
      select: { id: true, schoolId: true, isReviewed: true },
    });

    if (!comment) {
      return { success: false, error: "留言不存在" };
    }

    if (comment.schoolId !== auth.schoolId) {
      return { success: false, error: "无权操作其他学校的留言" };
    }

    if (!comment.isReviewed) {
      return { success: false, error: "仅已审核的留言可永久删除，请先通过或隐藏后再删除" };
    }

    await prisma.$transaction(async (tx) => {
      await createCommentLog(comment.id, auth.userId, "HARD_DELETED", null, tx);
      await (tx as typeof prisma).comment.delete({ where: { id: comment.id } });
    });

    return { success: true };
  } catch (err) {
    console.error("[hardDeleteComment]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/**
 * 批量永久删除留言（物理删除）
 * 同 hardDeleteComment 的安全校验，逐条校验并删除
 */
export async function hardDeleteComments(commentIds: string[]): Promise<HardDeleteCommentsResult> {
  try {
    const auth = await requireAdmin();

    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const ids = commentIds.filter((id) => id?.trim()).map((id) => id.trim());
    if (ids.length === 0) {
      return { success: false, error: "未选择任何留言" };
    }

    let deleted = 0;
    for (const id of ids) {
      const result = await hardDeleteComment(id);
      if (result.success) deleted++;
    }

    return { success: true, deleted };
  } catch (err) {
    console.error("[hardDeleteComments]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "批量删除失败",
    };
  }
}
