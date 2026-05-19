"use server";

/**
 * 留言写入相关 Server Actions
 * 创建留言、快捷回复
 */

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { createNotification, markAsRead } from "@/lib/actions/notification";
import { validateContent } from "@/lib/content/validator";
import { NotificationType, NotificationEntityType } from "@prisma/client";
import type { CreateCommentResult, SubmitQuickReplyResult } from "@/lib/comment/types";

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
