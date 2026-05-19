"use server";

import { prisma } from "@/lib/core/prisma";
import { Prisma } from "@prisma/client";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { validateContent } from "@/lib/content/validator";
import { deniedBySchoolTenant } from "@/lib/school/scope";
import { revalidatePath } from "next/cache";

// ---------- Types ----------

interface SquarePostActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateSquarePostDTO {
  title: string;
  content: string;
  images: string[];
  poiId?: string | null;
  scope?: "INTRA" | "INTER";
}

export interface SquarePostItem {
  id: string;
  schoolId: string;
  userId: string;
  title: string;
  content: string;
  images: string[];
  poiId: string | null;
  scope: "INTRA" | "INTER";
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
  };
  poi: {
    id: string;
    name: string;
  } | null;
  school?: {
    id: string;
    name: string;
  } | null;
}

export interface GetSquarePostsResult {
  posts: SquarePostItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------- Constants ----------

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 5000;
const MAX_IMAGES = 9;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const AUTO_HIDE_REPORT_THRESHOLD = 5;

// ---------- Create ----------

export async function createSquarePost(
  data: CreateSquarePostDTO
): Promise<SquarePostActionResult<SquarePostItem>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }
    if (!auth.schoolId) {
      return { success: false, error: "未绑定学校，无法发帖" };
    }

    // 标题校验
    const rawTitle = data.title?.trim();
    if (!rawTitle) {
      return { success: false, error: "标题不能为空" };
    }
    if (rawTitle.length > MAX_TITLE_LENGTH) {
      return { success: false, error: `标题不能超过 ${MAX_TITLE_LENGTH} 字` };
    }

    // 内容校验
    const rawContent = data.content?.trim();
    if (!rawContent) {
      return { success: false, error: "内容不能为空" };
    }
    if (rawContent.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: `内容不能超过 ${MAX_CONTENT_LENGTH} 字` };
    }

    // 图片校验
    const images = Array.isArray(data.images) ? data.images : [];
    if (images.length > MAX_IMAGES) {
      return { success: false, error: `最多上传 ${MAX_IMAGES} 张图片` };
    }

    // 内容安全校验
    const sanitizedTitle = (await validateContent(rawTitle, { checkNumbers: true })).trim();
    const sanitizedContent = (await validateContent(rawContent, { checkNumbers: true })).trim();

    // 确定 schoolId
    let schoolId = auth.schoolId;

    // scope 校验
    const scope: "INTRA" | "INTER" = data.scope === "INTER" ? "INTER" : "INTRA";

    // POI 挂载校验
    let poiId: string | null = null;
    if (data.poiId) {
      const poi = await prisma.pOI.findUnique({
        where: { id: data.poiId },
        select: { id: true, schoolId: true },
      });
      if (!poi) {
        return { success: false, error: "所选地点不存在" };
      }
      if (deniedBySchoolTenant(auth, poi.schoolId)) {
        return { success: false, error: "只能挂载本校地点" };
      }
      poiId = poi.id;
      schoolId = poi.schoolId;
    }

    const post = await prisma.squarePost.create({
      data: {
        schoolId,
        userId: auth.userId,
        title: sanitizedTitle,
        content: sanitizedContent,
        images,
        poiId,
        scope,
      },
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        poi: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    revalidatePath("/square");

    return {
      success: true,
      data: {
        id: post.id,
        schoolId: post.schoolId,
        userId: post.userId,
        title: post.title,
        content: post.content,
        images: post.images as string[],
        poiId: post.poiId,
        scope: post.scope,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        createdAt: post.createdAt,
        user: post.user,
        poi: post.poi,
        school: post.school,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    console.error("创建广场帖子失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "发帖失败，请重试",
    };
  }
}

// ---------- List ----------

export async function getSquarePosts(
  schoolId: string,
  options?: { page?: number; limit?: number; scope?: "INTRA" | "INTER" | "ALL" }
): Promise<SquarePostActionResult<GetSquarePostsResult>> {
  try {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, options?.limit ?? DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * limit;
    const scopeFilter = options?.scope ?? "ALL";

    // 校内帖：仅本校可见；校际帖：所有学校可见
    const include = {
      user: { select: { id: true, nickname: true, avatar: true } },
      poi: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
    } as const;

    type PostWithRelations = Prisma.SquarePostGetPayload<{ include: typeof include }>;

    const where = {
      isHidden: false,
      reportCount: { lt: AUTO_HIDE_REPORT_THRESHOLD },
      ...(scopeFilter === "INTRA"
        ? { schoolId, scope: "INTRA" as const }
        : scopeFilter === "INTER"
          ? { scope: "INTER" as const }
          : {
              OR: [
                { schoolId, scope: "INTRA" as const },
                { scope: "INTER" as const },
              ],
            }),
    };

    const [posts, total] = await Promise.all([
      prisma.squarePost.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include,
      }),
      prisma.squarePost.count({ where }),
    ]);

    return {
      success: true,
      data: {
        posts: (posts as PostWithRelations[]).map((p) => ({
          id: p.id,
          schoolId: p.schoolId,
          userId: p.userId,
          title: p.title,
          content: p.content,
          images: p.images as string[],
          poiId: p.poiId,
          scope: p.scope,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          createdAt: p.createdAt,
          user: p.user,
          poi: p.poi,
          school: p.school,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  } catch (error) {
    console.error("获取广场帖子列表失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "获取帖子列表失败",
    };
  }
}

// ---------- Detail ----------

export async function getSquarePostDetail(
  id: string
): Promise<SquarePostActionResult<SquarePostItem>> {
  try {
const include = {
        user: { select: { id: true, nickname: true, avatar: true } },
        poi: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      } as const;

      type PostDetailWithRelations = Prisma.SquarePostGetPayload<{ include: typeof include }>;

      const post = await prisma.squarePost.findUnique({
        where: { id },
        include,
      }) as PostDetailWithRelations | null;

    if (!post || post.isHidden || post.reportCount >= AUTO_HIDE_REPORT_THRESHOLD) {
      return { success: false, error: "帖子不存在或已被隐藏" };
    }

    return {
      success: true,
      data: {
        id: post.id,
        schoolId: post.schoolId,
        userId: post.userId,
        title: post.title,
        content: post.content,
        images: post.images as string[],
        poiId: post.poiId,
        scope: post.scope,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        createdAt: post.createdAt,
        user: post.user,
        poi: post.poi,
        school: post.school,
      },
    };
  } catch (error) {
    console.error("获取广场帖子详情失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "获取帖子详情失败",
    };
  }
}

// ---------- Delete ----------

export async function deleteSquarePost(
  id: string
): Promise<SquarePostActionResult<void>> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const post = await prisma.squarePost.findUnique({
      where: { id },
      select: { userId: true, schoolId: true },
    });

    if (!post) {
      return { success: false, error: "帖子不存在" };
    }

    // 仅作者本人可删除（管理员走审核流程，不直接删除）
    if (post.userId !== auth.userId) {
      return { success: false, error: "只能删除自己的帖子" };
    }

    await prisma.squarePost.delete({ where: { id } });

    revalidatePath("/square");

    return { success: true };
  } catch (error) {
    console.error("删除广场帖子失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "删除失败，请重试",
    };
  }
}
