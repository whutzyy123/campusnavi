"use server";

/**
 * 信息反馈 / Bug 提交 Server Actions
 * 用户可提交使用体验反馈和 Bug 报告，查看自己的提交记录
 * 系统管理员可查看全部反馈
 */

import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { validateContent } from "@/lib/content-validator";
import { FeedbackType, FeedbackStatus } from "@prisma/client";

export interface FeedbackActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateFeedbackDTO {
  type: "FEEDBACK" | "BUG";
  title: string;
  content: string;
  images?: string[];
}

export interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  content: string;
  images: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    nickname: string | null;
    email: string | null;
  };
}

const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 2000;
const MAX_IMAGES = 3;

/**
 * 创建反馈/Bug 提交
 * - 需登录
 * - title、content 必填，通过敏感词校验
 */
export async function createFeedback(
  data: CreateFeedbackDTO
): Promise<FeedbackActionResult<FeedbackItem>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录后再提交" };
    }

    const { type, title, content, images } = data;

    const imagesArr = Array.isArray(images) ? images.filter((u): u is string => typeof u === "string") : [];
    if (imagesArr.length > MAX_IMAGES) {
      return { success: false, error: `图片最多 ${MAX_IMAGES} 张` };
    }

    if (!title?.trim()) {
      return { success: false, error: "标题为必填项" };
    }
    if (!content?.trim()) {
      return { success: false, error: "详情内容为必填项" };
    }
    if (title.trim().length > MAX_TITLE_LEN) {
      return { success: false, error: `标题最多 ${MAX_TITLE_LEN} 字` };
    }
    if (content.trim().length > MAX_CONTENT_LEN) {
      return { success: false, error: `详情内容最多 ${MAX_CONTENT_LEN} 字` };
    }
    if (type !== "FEEDBACK" && type !== "BUG") {
      return { success: false, error: "类型无效" };
    }

    const sanitizedTitle = (await validateContent(title.trim(), { checkNumbers: true })).trim();
    const sanitizedContent = (await validateContent(content.trim(), { checkNumbers: true })).trim();

    const feedback = await prisma.feedback.create({
      data: {
        userId: auth.userId,
        type: type as FeedbackType,
        title: sanitizedTitle,
        content: sanitizedContent,
        images: imagesArr,
      },
    });

    return {
      success: true,
      data: {
        id: feedback.id,
        type: feedback.type,
        title: feedback.title,
        content: feedback.content,
        images: (feedback.images as string[]) ?? [],
        status: feedback.status,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
      },
    };
  } catch (e) {
    console.error("[createFeedback]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "提交失败，请重试",
    };
  }
}

/**
 * 获取当前用户自己的反馈列表（分页）
 */
export async function getUserFeedbacks(
  userId: string,
  options?: { page?: number; limit?: number }
): Promise<
  FeedbackActionResult<{
    data: FeedbackItem[];
    total: number;
    pageCount: number;
    currentPage: number;
  }>
> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "userId 为必填项" };
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 10));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where: { userId: userId.trim() },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.feedback.count({ where: { userId: userId.trim() } }),
    ]);

    const data: FeedbackItem[] = items.map((f) => ({
      id: f.id,
      type: f.type,
      title: f.title,
      content: f.content,
      images: (f.images as string[]) ?? [],
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));

    return {
      success: true,
      data: {
        data,
        total,
        pageCount: Math.max(1, Math.ceil(total / limit)),
        currentPage: page,
      },
    };
  } catch (e) {
    console.error("[getUserFeedbacks]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "获取列表失败",
    };
  }
}

/**
 * 获取单条反馈详情（仅本人或超级管理员可查看）
 */
export async function getFeedbackById(
  id: string,
  userId: string,
  isSuperAdmin: boolean
): Promise<FeedbackActionResult<FeedbackItem>> {
  try {
    if (!id?.trim()) {
      return { success: false, error: "id 为必填项" };
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id: id.trim() },
      include: { user: { select: { id: true, nickname: true, email: true } } },
    });

    if (!feedback) {
      return { success: false, error: "反馈不存在" };
    }

    if (!isSuperAdmin && feedback.userId !== userId) {
      return { success: false, error: "无权查看该反馈" };
    }

    return {
      success: true,
      data: {
        id: feedback.id,
        type: feedback.type,
        title: feedback.title,
        content: feedback.content,
        images: (feedback.images as string[]) ?? [],
        status: feedback.status,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
        user: feedback.user
          ? {
              id: feedback.user.id,
              nickname: feedback.user.nickname,
              email: feedback.user.email,
            }
          : undefined,
      },
    };
  } catch (e) {
    console.error("[getFeedbackById]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "获取详情失败",
    };
  }
}

/**
 * 超级管理员：获取全部反馈列表（分页）
 */
export async function getAdminFeedbacks(options?: {
  page?: number;
  limit?: number;
  type?: "FEEDBACK" | "BUG";
  status?: "PENDING" | "RESOLVED" | "REJECTED";
}): Promise<
  FeedbackActionResult<{
    data: FeedbackItem[];
    total: number;
    pageCount: number;
    currentPage: number;
  }>
> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const role = auth.role as string;
    if (role !== "SUPER_ADMIN") {
      return { success: false, error: "仅系统管理员可查看" };
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: { type?: FeedbackType; status?: FeedbackStatus } = {};
    if (options?.type) where.type = options.type as FeedbackType;
    if (options?.status) where.status = options.status as FeedbackStatus;

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { id: true, nickname: true, email: true } } },
      }),
      prisma.feedback.count({ where }),
    ]);

    const data: FeedbackItem[] = items.map((f) => ({
      id: f.id,
      type: f.type,
      title: f.title,
      content: f.content,
      images: (f.images as string[]) ?? [],
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      user: f.user
        ? {
            id: f.user.id,
            nickname: f.user.nickname,
            email: f.user.email,
          }
        : undefined,
    }));

    return {
      success: true,
      data: {
        data,
        total,
        pageCount: Math.max(1, Math.ceil(total / limit)),
        currentPage: page,
      },
    };
  } catch (e) {
    console.error("[getAdminFeedbacks]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "获取列表失败",
    };
  }
}

/**
 * 超级管理员：更新反馈状态
 */
export async function updateFeedbackStatus(
  id: string,
  status: "PENDING" | "RESOLVED" | "REJECTED"
): Promise<FeedbackActionResult<FeedbackItem>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }
    if (auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅系统管理员可操作" };
    }

    const feedback = await prisma.feedback.update({
      where: { id: id.trim() },
      data: { status: status as FeedbackStatus },
    });

    return {
      success: true,
      data: {
        id: feedback.id,
        type: feedback.type,
        title: feedback.title,
        content: feedback.content,
        images: (feedback.images as string[]) ?? [],
        status: feedback.status,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
      },
    };
  } catch (e) {
    console.error("[updateFeedbackStatus]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "更新失败",
    };
  }
}
