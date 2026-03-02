import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

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
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return NextResponse.json(
        { success: false, message: "请先登录" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { words: rawWords, addedById } = body;

    if (!addedById || addedById !== auth.userId) {
      return NextResponse.json(
        { success: false, message: "添加人ID与当前登录用户不一致" },
        { status: 403 }
      );
    }

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

    // 验证添加人是否存在且是超级管理员
    const adder = await prisma.user.findUnique({
      where: { id: addedById },
      select: { id: true, role: true },
    });

    if (!adder) {
      return NextResponse.json(
        { success: false, message: "添加人不存在" },
        { status: 404 }
      );
    }

    if (adder.role !== 4) {
      return NextResponse.json(
        { success: false, message: "只有超级管理员才能批量导入屏蔽词" },
        { status: 403 }
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
          addedById,
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
