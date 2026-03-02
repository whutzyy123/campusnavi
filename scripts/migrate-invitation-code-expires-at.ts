/**
 * 一次性迁移脚本：为已有邀请码设置 expiresAt
 *
 * 对 expiresAt 为 null 的记录，设置 expiresAt = createdAt + 7 天。
 *
 * 运行方式：npx tsx scripts/migrate-invitation-code-expires-at.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("开始迁移：为 expiresAt 为 null 的邀请码设置默认过期时间 (createdAt + 7 天)...\n");

  const codes = await prisma.invitationCode.findMany({
    where: { expiresAt: null },
    select: { id: true, code: true, createdAt: true },
  });

  if (codes.length === 0) {
    console.log("没有需要迁移的记录。");
    return;
  }

  let updated = 0;

  for (const c of codes) {
    const expiresAt = new Date(c.createdAt);
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.invitationCode.update({
      where: { id: c.id },
      data: { expiresAt },
    });

    console.log(`[更新] ${c.code} (${c.id}): expiresAt = ${expiresAt.toISOString()}`);
    updated++;
  }

  console.log(`\n迁移完成: 共更新 ${updated} 条记录`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
