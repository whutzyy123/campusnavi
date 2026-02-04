/**
 * 内容校验工具
 * 用于检查用户提交的内容是否包含屏蔽词
 */

import { prisma } from "@/lib/prisma";

/**
 * 检查内容是否包含屏蔽词
 * @param content 要检查的内容
 * @returns 如果包含屏蔽词，返回匹配的屏蔽词；否则返回 null
 */
export async function checkSensitiveWords(content: string): Promise<string | null> {
  if (!content || typeof content !== "string") {
    return null;
  }

  // 获取所有屏蔽词
  const sensitiveWords = await prisma.sensitiveWord.findMany({
    select: {
      keyword: true,
    },
  });

  // 将内容转为小写以便不区分大小写匹配
  const lowerContent = content.toLowerCase();

  // 检查是否包含任何屏蔽词
  for (const word of sensitiveWords) {
    if (lowerContent.includes(word.keyword.toLowerCase())) {
      return word.keyword;
    }
  }

  return null;
}

/**
 * 校验内容，如果包含屏蔽词则抛出错误
 * @param content 要检查的内容
 * @throws Error 如果包含屏蔽词
 */
export async function validateContent(content: string): Promise<void> {
  const matchedWord = await checkSensitiveWords(content);
  if (matchedWord) {
    throw new Error("内容包含不当词汇，请修改后重试");
  }
}

