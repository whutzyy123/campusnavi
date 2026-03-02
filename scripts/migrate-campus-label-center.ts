/**
 * 一次性迁移脚本：为已有校区根据 boundary 计算并更新 labelCenter
 *
 * 使用 polylabel（Pole of Inaccessibility）算法，保证标签落在多边形内最“宽敞”的位置，
 * 对 L 形、U 形、细长多边形等复杂形状更准确。
 *
 * 运行方式：npm run migrate:label-center 或 npx tsx scripts/migrate-campus-label-center.ts
 */

import { PrismaClient } from "@prisma/client";
import { computeLabelCenter } from "@/lib/campus-label-utils";

const prisma = new PrismaClient();

function isValidBoundary(boundary: unknown): boolean {
  if (!boundary || typeof boundary !== "object") return false;
  const b = boundary as { type?: string; coordinates?: unknown[] };
  if (b.type === "Polygon" && Array.isArray(b.coordinates) && Array.isArray(b.coordinates[0]) && (b.coordinates[0] as unknown[]).length >= 3) return true;
  if (Array.isArray(boundary) && boundary.length >= 3) return true;
  return false;
}

async function main() {
  console.log("开始迁移：使用 polylabel 为已有校区计算 labelCenter...\n");

  const campuses = await prisma.campusArea.findMany({
    select: { id: true, name: true, schoolId: true, boundary: true, labelCenter: true },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const campus of campuses) {
    if (!isValidBoundary(campus.boundary)) {
      console.warn(`[跳过] ${campus.name} (${campus.id}): boundary 格式无效`);
      skipped++;
      continue;
    }

    try {
      const [lng, lat] = computeLabelCenter(campus.boundary as any);
      const labelCenter: [number, number] = [lng, lat];

      await prisma.campusArea.update({
        where: { id: campus.id },
        data: { labelCenter: labelCenter as any },
      });

      console.log(`[更新] ${campus.name} (${campus.id}): labelCenter = [${lng.toFixed(6)}, ${lat.toFixed(6)}]`);
      updated++;
    } catch (err) {
      console.error(`[失败] ${campus.name} (${campus.id}):`, err);
      failed++;
    }
  }

  console.log("\n迁移完成:");
  console.log(`  更新: ${updated}`);
  console.log(`  跳过: ${skipped}`);
  console.log(`  失败: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
