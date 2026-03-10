"use server";

/**
 * 平台屏蔽词 Server Actions
 * 仅超级管理员可管理
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";

export type KeywordActionResult<T = unknown> =
  | { success: true; data?: T; pagination?: { total: number; pageCount: number; currentPage: number }; message?: string }
  | { success: false; error: string };

/** 屏蔽词项 */
export interface SensitiveWordItem {
  id: string;
  keyword: string;
  createdAt: string;
  addedBy: { id: string; nickname: string };
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  if (!user || user.role !== 4) {
    return { ok: false, error: "仅超级管理员可管理屏蔽词" };
  }
  return { ok: true, userId: auth.userId };
}

/**
 * 获取屏蔽词列表（分页、搜索）
 */
export async function getKeywords(options?: {
  page?: number;
  limit?: number;
  q?: string;
}): Promise<KeywordActionResult<SensitiveWordItem[]>> {
  try {
    const perm = await requireSuperAdmin();
    if (!perm.ok) return { success: false, error: perm.error };

    const page = options?.page ?? 1;
    const limit = options?.limit ?? 10;
    const q = options?.q?.trim();
    const { skip, take } = getPaginationParams(page, limit);

    const where = q ? { keyword: { contains: q } } : {};

    const [total, keywords] = await Promise.all([
      prisma.sensitiveWord.count({ where }),
      prisma.sensitiveWord.findMany({
        where,
        select: {
          id: true,
          keyword: true,
          createdAt: true,
          addedBy: { select: { id: true, nickname: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    const pagination = getPaginationMeta(total, page, limit);

    return {
      success: true,
      data: keywords.map((kw) => ({
        id: kw.id,
        keyword: kw.keyword,
        createdAt: kw.createdAt.toISOString(),
        addedBy: {
          id: kw.addedBy.id,
          nickname: kw.addedBy.nickname || "未知",
        },
      })),
      pagination: {
        total: pagination.total,
        pageCount: pagination.pageCount,
        currentPage: pagination.currentPage,
      },
    };
  } catch (err) {
    console.error("getKeywords 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取屏蔽词列表失败",
    };
  }
}

/**
 * 新增屏蔽词
 */
export async function createKeyword(keyword: string): Promise<KeywordActionResult<SensitiveWordItem>> {
  try {
    const perm = await requireSuperAdmin();
    if (!perm.ok) return { success: false, error: perm.error };

    const trimmed = keyword.trim();
    if (!trimmed) return { success: false, error: "屏蔽词不能为空" };

    const existing = await prisma.sensitiveWord.findUnique({
      where: { keyword: trimmed },
    });
    if (existing) return { success: false, error: "该屏蔽词已存在" };

    const created = await prisma.sensitiveWord.create({
      data: { keyword: trimmed, addedById: perm.userId },
      include: { addedBy: { select: { id: true, nickname: true } } },
    });

    return {
      success: true,
      data: {
        id: created.id,
        keyword: created.keyword,
        createdAt: created.createdAt.toISOString(),
        addedBy: {
          id: created.addedBy.id,
          nickname: created.addedBy.nickname || "未知",
        },
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { success: false, error: "该屏蔽词已存在" };
    }
    console.error("createKeyword 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "添加屏蔽词失败",
    };
  }
}

/**
 * 批量导入屏蔽词
 */
export async function bulkCreateKeywords(
  words: string[]
): Promise<KeywordActionResult<{ added: number; skipped: number }>> {
  try {
    const perm = await requireSuperAdmin();
    if (!perm.ok) return { success: false, error: perm.error };

    const uniqueWords = [...new Set(words.map((w) => w.trim()).filter((w) => w.length > 0))];
    if (uniqueWords.length === 0) {
      return { success: false, error: "未解析到有效词汇" };
    }

    const existing = await prisma.sensitiveWord.findMany({
      where: { keyword: { in: uniqueWords } },
      select: { keyword: true },
    });
    const existingSet = new Set(existing.map((e) => e.keyword));
    const toInsert = uniqueWords.filter((w) => !existingSet.has(w));

    let added = 0;
    if (toInsert.length > 0) {
      const result = await prisma.sensitiveWord.createMany({
        data: toInsert.map((keyword) => ({ keyword, addedById: perm.userId })),
        skipDuplicates: true,
      });
      added = result.count;
    }

    const skipped = uniqueWords.length - added;

    return {
      success: true,
      data: { added, skipped },
    };
  } catch (err) {
    console.error("bulkCreateKeywords 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "批量导入失败",
    };
  }
}

/**
 * 删除屏蔽词
 */
export async function deleteKeyword(id: string): Promise<KeywordActionResult> {
  try {
    const perm = await requireSuperAdmin();
    if (!perm.ok) return { success: false, error: perm.error };

    const keyword = await prisma.sensitiveWord.findUnique({
      where: { id },
    });

    if (!keyword) return { success: false, error: "屏蔽词不存在" };

    await prisma.sensitiveWord.delete({
      where: { id },
    });

    return { success: true, message: "屏蔽词删除成功" };
  } catch (err) {
    console.error("deleteKeyword 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除屏蔽词失败",
    };
  }
}
