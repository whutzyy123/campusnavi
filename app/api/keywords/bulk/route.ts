import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * 解析文本中的词汇：支持逗号、换行、空格分隔
 */
function parseWordsFromText(text: string): string[] {
  return text
    .split(/[\s,\n\r\t]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/**
 * POST /api/keywords/bulk
 * 批量导入屏蔽词（仅限超级管理员）
 *
 * 请求体：
 * {
 *   words: string[],  // 词汇列表
 *   addedById: string // 添加人ID（必须是超级管理员）
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    const body = await request.json();
    const { words: rawWords } = body;

    // 解析词汇：支持数组或拼接字符串
    let words: string[];
    if (Array.isArray(rawWords)) {
      words = rawWords
        .map((w: unknown) => (typeof w === "string" ? w.trim() : ""))
        .filter((w) => w.length > 0);
    } else if (typeof rawWords === "string") {
      words = parseWordsFromText(rawWords);
    } else {
      return NextResponse.json(
        { success: false, message: "words 必须为字符串数组或逗号/换行分隔的文本" },
        { status: 400 }
      );
    }

    if (words.length === 0) {
      return NextResponse.json(
        { success: false, message: "未解析到有效词汇" },
        { status: 400 }
      );
    }

    // 去重（同一批次内的重复）
    const uniqueWords = [...new Set(words)];

    // 查询已存在的词汇
    const existing = await prisma.sensitiveWord.findMany({
      where: { keyword: { in: uniqueWords } },
      select: { keyword: true },
    });
    const existingSet = new Set(existing.map((e) => e.keyword));

    const toInsert = uniqueWords.filter((w) => !existingSet.has(w));
    let added = 0;

    if (toInsert.length > 0) {
      const result = await prisma.sensitiveWord.createMany({
        data: toInsert.map((keyword) => ({
          keyword,
          addedById: auth.userId,
        })),
        skipDuplicates: true,
      });
      added = result.count;
    }

    const skipped = uniqueWords.length - added;

    return NextResponse.json({
      success: true,
      message: `成功添加 ${added} 个屏蔽词，${skipped} 个重复已跳过`,
      data: {
        added,
        skipped,
        total: uniqueWords.length,
      },
    });
  } catch (error) {
    console.error("批量导入屏蔽词失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "服务器内部错误",
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
