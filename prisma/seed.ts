/**
 * 数据库种子数据脚本
 * 用于初始化系统超级管理员账号和测试账号
 * 
 * 运行方式：
 * npx tsx prisma/seed.ts
 * 或
 * npm run seed (需要在 package.json 中添加脚本)
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth-utils";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始初始化种子数据...");

  // 1. 创建系统学校（用于超级管理员）
  let systemSchool = await prisma.school.findFirst({
    where: {
      schoolCode: "system",
    },
  });

  if (!systemSchool) {
    systemSchool = await prisma.school.create({
      data: {
        name: "系统",
        schoolCode: "system",
        boundary: {
          type: "Polygon",
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
        },
        centerLat: 0,
        centerLng: 0,
      },
    });
    console.log("✅ 创建系统学校:", systemSchool.id);
  }

  // 2. 创建测试学校（如果不存在）
  let testSchool = await prisma.school.findFirst({
    where: {
      schoolCode: "test",
    },
  });

  if (!testSchool) {
    testSchool = await prisma.school.create({
      data: {
        name: "测试大学",
        schoolCode: "test",
        boundary: {
          type: "Polygon",
          coordinates: [
            [
              [116.3, 39.9],
              [116.35, 39.9],
              [116.35, 39.95],
              [116.3, 39.95],
              [116.3, 39.9],
            ],
          ],
        },
        centerLat: 39.925,
        centerLng: 116.325,
      },
    });
    console.log("✅ 创建测试学校:", testSchool.id);
  }

  // 3. 创建超级管理员账号
  const superAdminEmail = "admin@system.local";
  let superAdmin = await prisma.user.findFirst({
    where: {
      email: superAdminEmail,
    },
  });

  if (!superAdmin) {
    const password = "123456";
    const hashedPassword = await hashPassword(password);

    superAdmin = await prisma.user.create({
      data: {
        schoolId: null, // 超级管理员不绑定学校
        nickname: "系统管理员",
        email: superAdminEmail,
        password: hashedPassword,
        role: 4, // SUPER_ADMIN
      },
    });

    console.log("✅ 超级管理员创建成功！");
    console.log("   📧 邮箱:", superAdminEmail);
    console.log("   🔑 密码: 123456");
    console.log("   🏫 学校: 无（系统级管理员）");
  } else {
    // 如果已存在但绑定了学校，更新为 null
    if (superAdmin.schoolId) {
      await prisma.user.update({
        where: { id: superAdmin.id },
        data: { schoolId: null },
      });
      console.log("✅ 已更新超级管理员，解除学校绑定");
    } else {
      console.log("ℹ️  超级管理员已存在，跳过创建");
    }
  }

  // 4. 创建测试账号
  const testAccounts = [
    {
      email: "student@test.com",
      nickname: "测试学生",
      role: 1, // STUDENT
      schoolId: testSchool.id,
    },
    {
      email: "admin@test.com",
      nickname: "测试管理员",
      role: 2, // ADMIN (校级管理员)
      schoolId: testSchool.id,
    },
    {
      email: "staff@test.com",
      nickname: "测试工作人员",
      role: 3, // STAFF
      schoolId: testSchool.id,
    },
  ];

  const password = "123456";
  const hashedPassword = await hashPassword(password);

  for (const account of testAccounts) {
    const existing = await prisma.user.findFirst({
      where: {
        email: account.email,
      },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          ...account,
          password: hashedPassword,
        },
      });
      console.log(`✅ 创建测试账号: ${account.email} (${account.nickname})`);
    } else {
      console.log(`ℹ️  测试账号已存在: ${account.email}`);
    }
  }

  console.log("\n📋 测试账号列表：");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("超级管理员：");
  console.log("  邮箱: admin@system.local");
  console.log("  密码: 123456");
  console.log("  角色: SUPER_ADMIN");
  console.log("\n测试学校账号：");
  console.log("  学生账号: student@test.com / 123456 (STUDENT)");
  console.log("  管理员账号: admin@test.com / 123456 (ADMIN)");
  console.log("  工作人员账号: staff@test.com / 123456 (STAFF)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n✨ 种子数据初始化完成！");
}

main()
  .catch((e) => {
    console.error("❌ 种子数据初始化失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
