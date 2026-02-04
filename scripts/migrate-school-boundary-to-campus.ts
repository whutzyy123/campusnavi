/**
 * 数据迁移脚本：将 School.boundary 迁移到 CampusArea
 * 
 * 使用方法：
 * 1. 确保已运行 `npx prisma generate` 生成 Prisma Client
 * 2. 运行 `npx tsx scripts/migrate-school-boundary-to-campus.ts`
 * 
 * 注意：此脚本会为每个有 boundary 的学校创建一个默认的 CampusArea 记录
 */

import { PrismaClient } from "@prisma/client";
import { centroid } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

const prisma = new PrismaClient();

async function main() {
  console.log("开始迁移 School.boundary 到 CampusArea...");

  try {
    // 查找所有有 boundary 的学校
    const schools = await prisma.school.findMany({
      where: {
        boundary: {
          not: null,
        },
      },
    });

    console.log(`找到 ${schools.length} 个有边界的学校`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const school of schools) {
      // 检查该学校是否已有校区
      const existingCampuses = await prisma.campusArea.findMany({
        where: {
          schoolId: school.id,
        },
      });

      if (existingCampuses.length > 0) {
        console.log(`学校 "${school.name}" 已有 ${existingCampuses.length} 个校区，跳过迁移`);
        skippedCount++;
        continue;
      }

      // 解析 boundary 数据
      let boundary = school.boundary as any;
      if (typeof boundary === "string") {
        try {
          boundary = JSON.parse(boundary);
        } catch (error) {
          console.error(`解析学校 "${school.name}" 的边界数据失败:`, error);
          skippedCount++;
          continue;
        }
      }

      if (!boundary || boundary.type !== "Polygon") {
        console.log(`学校 "${school.name}" 的边界数据格式无效，跳过`);
        skippedCount++;
        continue;
      }

      // 计算中心点（如果学校没有 center，使用 boundary 计算）
      let center: [number, number];
      if (school.centerLng && school.centerLat) {
        center = [school.centerLng, school.centerLat];
      } else {
        // 使用 Turf.js 计算中心点
        const polygonFeature: Feature<Polygon> = {
          type: "Feature",
          geometry: boundary,
          properties: {},
        };
        const centerPoint = centroid(polygonFeature);
        center = centerPoint.geometry.coordinates as [number, number];
      }

      // 创建 CampusArea 记录
      await prisma.campusArea.create({
        data: {
          schoolId: school.id,
          name: "主校区", // 默认名称
          boundary: boundary,
          center: center as any,
        },
      });

      console.log(`✓ 已为学校 "${school.name}" 创建校区 "主校区"`);
      migratedCount++;
    }

    console.log("\n迁移完成！");
    console.log(`- 成功迁移: ${migratedCount} 个学校`);
    console.log(`- 跳过: ${skippedCount} 个学校`);
  } catch (error) {
    console.error("迁移失败:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error("脚本执行失败:", error);
    process.exit(1);
  });
