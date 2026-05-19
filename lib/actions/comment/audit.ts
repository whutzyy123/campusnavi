"use server";

/**
 * 留言审核相关 Server Actions
 * 审核列表、审核操作
 */

import { prisma } from "@/lib/core/prisma";
import { requireAdmin } from "@/lib/auth/server-actions";
import type {
  AuditCommentCountsResult,
  GetAuditCommentsResult,
  ReviewCommentResult,
} from "@/lib/comment/types";

/**
 * 获取审核留言数量（待处理、已处理）
 */
export async function getAuditCommentCounts(): Promise<AuditCommentCountsResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const [pending, processed] = await Promise.all([
      prisma.comment.count({
        where: { schoolId: auth.schoolId, reportCount: { gte: 3 }, isReviewed: false },
      }),
      prisma.comment.count({
        where: { schoolId: auth.schoolId, isReviewed: true },
      }),
    ]);

    return { success: true, pending, processed };
  } catch (err) {
    console.error("[getAuditCommentCounts]", err);
    return { success: false, error: err instanceof Error ? err.message : "获取数量失败" };
  }
}

/**
 * 获取审核留言列表（管理员/工作人员，仅本校）
 */
export async function getAuditComments(
  filter: "pending" | "processed" = "pending",
  page = 1,
  limit = 10
): Promise<GetAuditCommentsResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核" };
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
          reviewer: { select: { id: true, nickname: true, email: true } },
          user: { select: { id: true, nickname: true, email: true, avatar: true } },
          poi: { select: { id: true, name: true, category: true } },
        },
        orderBy: filter === "pending" ? { reportCount: "desc" as const } : { reviewedAt: "desc" as const },
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
    return { success: false, error: err instanceof Error ? err.message : "获取审核留言列表失败" };
  }
}

/**
 * 审核留言：恢复或隐藏
 */
export async function reviewComment(
  commentId: string,
  action: "RESTORE" | "HIDE"
): Promise<ReviewCommentResult> {
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
    return { success: false, error: err instanceof Error ? err.message : "操作失败" };
  }
}