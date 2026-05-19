"use server";

/**
 * 留言永久删除相关 Server Actions
 */

import { prisma } from "@/lib/core/prisma";
import { requireAdmin } from "@/lib/auth/server-actions";
import type { HardDeleteCommentResult, HardDeleteCommentsResult } from "@/lib/comment/types";

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
 */
export async function hardDeleteComment(commentId: string): Promise<HardDeleteCommentResult> {
  try {
    const auth = await requireAdmin();

    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核" };
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
    return { success: false, error: err instanceof Error ? err.message : "操作失败" };
  }
}

/**
 * 批量永久删除留言（物理删除）
 */
export async function hardDeleteComments(commentIds: string[]): Promise<HardDeleteCommentsResult> {
  try {
    const auth = await requireAdmin();

    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核" };
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
    return { success: false, error: err instanceof Error ? err.message : "批量删除失败" };
  }
}