/**
 * 内容校验工具
 * 用于检查用户提交的内容是否包含屏蔽词
 * 支持数字序列屏蔽（6 位及以上连续数字，如 QQ、手机号、微信号）
 */

import { prisma } from "@/lib/prisma";

/** 6 位及以上连续数字（QQ、手机号、微信号等） */
const NUMERIC_SEQUENCE_REGEX = /\d{6,}/g;

const NUMERIC_SHIELD = "******";

/**
 * 屏蔽内容中的长数字序列（6 位及以上）
 * @param content 原始内容
 * @returns 屏蔽后的内容
 */
export function shieldNumericSequences(content: string): string {
  if (!content || typeof content !== "string") return content;
  return content.replace(NUMERIC_SEQUENCE_REGEX, NUMERIC_SHIELD);
}

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

export interface ValidateContentOptions {
  /** 是否屏蔽 6 位及以上连续数字（QQ、手机号、微信号等），默认 false */
  checkNumbers?: boolean;
  /** 是否屏蔽 6 位及以上连续数字（与 checkNumbers 等效，用于语义清晰） */
  maskNumbers?: boolean;
}

/**
 * 校验内容，如果包含屏蔽词则抛出错误
 * 当 checkNumbers 或 maskNumbers 为 true 时，会屏蔽数字序列并返回处理后的内容
 * @param content 要检查的内容
 * @param options 可选配置
 * @returns 处理后的内容（checkNumbers/maskNumbers 为 true 时返回屏蔽后的字符串，否则返回原内容）
 * @throws Error 如果包含屏蔽词
 */
export async function validateContent(
  content: string,
  options?: ValidateContentOptions
): Promise<string> {
  let contentToCheck = content;
  const shouldMaskNumbers = options?.checkNumbers ?? options?.maskNumbers ?? false;
  if (shouldMaskNumbers) {
    contentToCheck = shieldNumericSequences(content);
  }

  const matchedWord = await checkSensitiveWords(contentToCheck);
  if (matchedWord) {
    throw new Error("内容包含敏感词汇，请修改后重试。");
  }

  return contentToCheck;
}

