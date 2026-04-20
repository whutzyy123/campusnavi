import { prisma } from "@/lib/prisma";

/**
 * 基于 Prisma rate_limits 表的固定窗口计数限流。
 * @returns true 表示允许本次请求，false 表示超限
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimit.findUnique({
      where: { key },
      select: { id: true, count: true, windowStart: true },
    });

    if (!existing || existing.windowStart < windowStart) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
        select: { id: true },
      });
      return { allowed: true };
    }

    if (existing.count >= limit) {
      return { allowed: false };
    }

    await tx.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
      select: { id: true },
    });
    return { allowed: true };
  });

  return result.allowed;
}
