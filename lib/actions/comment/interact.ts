"use server";

/**
 * 留言交互相关 Server Actions
 * 点赞、删除、举报
 */

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { deniedBySchoolTenant } from "@/lib/school/scope";
import { createNotification } from "@/lib/actions/notification";
import { NotificationType, NotificationEntityType } from "@prisma/client";
import type { ToggleLikeResult, DeleteCommentResult, ReportCommentResult } from "@/lib/comment/types";

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

    if (deniedBySchoolTenant(auth, comment.schoolId)) {
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

        if (comment.userId !== auth.userId) {
          await tx.user.updateMany({
            where: { id: comment.userId, points: { gt: 0 } },
            data: { points: { decrement: 1 } },
          });
        }

        return { isLiked: false, newCount: Math.max(0, updated.likeCount) };
      } else {
        await tx.commentLike.create({
          data: { userId: auth.userId, commentId: comment.id },
        });
        const updated = await tx.comment.update({
          where: { id: comment.id },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        if (comment.userId !== auth.userId) {
          await tx.user.update({
            where: { id: comment.userId },
            data: { points: { increment: 1 } },
            select: { id: true },
          });
        }

        return { isLiked: true, newCount: updated.likeCount };
      }
    });

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

    return { success: true, isLiked: result.isLiked, newCount: result.newCount };
  } catch (err) {
    console.error("[toggleCommentLike]", err);
    return { success: false, error: err instanceof Error ? err.message : "操作失败" };
  }
}

/**
 * 删除留言：仅作者本人 / 校管理员 / 超级管理员
 */
export async function deleteComment(commentId: string): Promise<DeleteCommentResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "未登录用户无权删除留言" };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId.trim() },
      select: { id: true, userId: true, schoolId: true, reportCount: true },
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
    return { success: false, error: err instanceof Error ? err.message : "删除失败" };
  }
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

    const reportKey = `report:comment:${comment.id}:user:${auth.userId}`;
    const result = await prisma.$transaction(async (tx) => {
      try {
        await tx.rateLimit.create({
          data: { key: reportKey, count: 1, windowStart: new Date() },
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
          return { duplicated: true, reportCount: comment.reportCount, isHidden: comment.isHidden, isAutoHidden: false };
        }
        throw error;
      }

      const updated = await tx.comment.update({
        where: { id: comment.id },
        data: { reportCount: { increment: 1 } },
        select: { id: true, reportCount: true, isHidden: true },
      });

      let finalIsHidden = updated.isHidden;
      if (updated.reportCount >= 5 && !updated.isHidden) {
        await tx.comment.update({ where: { id: updated.id }, data: { isHidden: true } });
        finalIsHidden = true;
      }

      return { duplicated: false, reportCount: updated.reportCount, isHidden: finalIsHidden, isAutoHidden: updated.reportCount >= 5 && !comment.isHidden };
    });

    if (result.duplicated) {
      return { success: true, reportCount: result.reportCount, isHidden: result.isHidden, isAutoHidden: false, message: "你已举报过该留言，管理员将结合历史举报进行审核" };
    }

    let message = "举报已收到，管理员将进行审核";
    if (result.isAutoHidden) {
      message = "该内容已被众包屏蔽（举报次数达到5次）";
    } else if (result.reportCount === 4) {
      message = "举报已收到，再收到1次举报将自动屏蔽";
    }

    return { success: true, reportCount: result.reportCount, isHidden: result.isHidden, isAutoHidden: result.isAutoHidden, message };
  } catch (err) {
    console.error("[reportComment]", err);
    return { success: false, error: err instanceof Error ? err.message : "举报失败" };
  }
}