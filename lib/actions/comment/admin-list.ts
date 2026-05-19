"use server";

/**
 * 管理端留言列表 Server Actions
 * 学校留言管理
 */

import { prisma } from "@/lib/core/prisma";
import { requireAdmin } from "@/lib/auth/server-actions";
import type {
  GetSchoolCommentsParams,
  GetSchoolCommentsResult,
  GetSchoolCommentDetailResult,
  SchoolCommentDetailItem,
} from "@/lib/comment/types";

/**
 * 获取本校全部留言（管理员/工作人员，用于管理概览）
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
    } = { schoolId: auth.schoolId };

    if (params.poiId?.trim()) where.poiId = params.poiId.trim();
    if (params.userId?.trim()) where.userId = params.userId.trim();
    if (params.status === "visible") where.isHidden = false;
    else if (params.status === "hidden") where.isHidden = true;
    if (params.isReviewed === true) where.isReviewed = true;
    else if (params.isReviewed === false) where.isReviewed = false;

    const search = params.search?.trim();
    const searchFilter = search
      ? { OR: [{ poi: { name: { contains: search } } }, { user: { nickname: { contains: search } } }] }
      : {};

    const fullWhere = { ...where, ...searchFilter };

    const [total, comments] = await Promise.all([
      prisma.comment.count({ where: fullWhere }),
      prisma.comment.findMany({
        where: fullWhere,
        select: {
          id: true, content: true, createdAt: true, isHidden: true, isReviewed: true,
          reportCount: true, likeCount: true, parentId: true,
          user: { select: { id: true, nickname: true, avatar: true, email: true } },
          poi: { select: { id: true, name: true, category: true } },
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
        id: c.id, content: c.content, createdAt: c.createdAt.toISOString(),
        isHidden: c.isHidden, isReviewed: c.isReviewed, reportCount: c.reportCount,
        likeCount: c.likeCount, parentId: c.parentId, user: c.user, poi: c.poi,
      })),
      pagination: { total, pageCount, currentPage: page, limit },
    };
  } catch (err) {
    console.error("[getSchoolComments]", err);
    return { success: false, error: err instanceof Error ? err.message : "获取留言列表失败" };
  }
}

/**
 * 获取本校单条留言详情（含父留言）
 */
export async function getSchoolCommentDetail(commentId: string): Promise<GetSchoolCommentDetailResult> {
  try {
    const auth = await requireAdmin();
    if (auth.role === "SUPER_ADMIN") {
      return { success: false, error: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "当前管理员未绑定学校" };
    }

    const comment = await prisma.comment.findFirst({
      where: { id: commentId.trim(), schoolId: auth.schoolId },
      select: {
        id: true, content: true, createdAt: true, isHidden: true, isReviewed: true,
        reportCount: true, likeCount: true, parentId: true,
        user: { select: { id: true, nickname: true, avatar: true, email: true } },
        poi: { select: { id: true, name: true, category: true } },
        parent: {
          select: { id: true, content: true, createdAt: true, isHidden: true, user: { select: { id: true, nickname: true, avatar: true, email: true } } },
        },
      },
    });

    if (!comment) {
      return { success: false, error: "留言不存在或无权查看" };
    }

    return {
      success: true,
      data: {
        id: comment.id, content: comment.content, createdAt: comment.createdAt.toISOString(),
        isHidden: comment.isHidden, isReviewed: comment.isReviewed, reportCount: comment.reportCount,
        likeCount: comment.likeCount, parentId: comment.parentId, user: comment.user, poi: comment.poi,
        parent: comment.parent ? {
          id: comment.parent.id, content: comment.parent.content,
          createdAt: comment.parent.createdAt.toISOString(), isHidden: comment.parent.isHidden,
          user: comment.parent.user,
        } : null,
      } as SchoolCommentDetailItem,
    };
  } catch (err) {
    console.error("[getSchoolCommentDetail]", err);
    return { success: false, error: err instanceof Error ? err.message : "获取留言详情失败" };
  }
}