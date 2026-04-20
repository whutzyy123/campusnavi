import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-utils";
import { requireSeedBearerIfConfigured } from "@/lib/seed-route-auth";

/**
 * POST /api/auth/seed-test-accounts
 * 初始化测试账号（仅用于开发环境）
 * 
 * 注意：生产环境应禁用此接口
 */
export async function POST(request: NextRequest) {
  // 仅允许在开发环境运行
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, message: "生产环境禁止使用此接口" },
      { status: 403 }
    );
  }

  const seedAuth = requireSeedBearerIfConfigured(request);
  if (seedAuth) return seedAuth;

  try {
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
        },
      });
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
          centerLat: 39.925,
          centerLng: 116.325,
        },
      });
    }

    const password = "123456";
    const hashedPassword = await hashPassword(password);

    const accounts = [];

    // 3. 创建超级管理员
    const superAdminEmail = "admin@system.local";
    let superAdmin = await prisma.user.findFirst({
      where: { email: superAdminEmail },
    });

    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          schoolId: null,
          nickname: "系统管理员",
          email: superAdminEmail,
          password: hashedPassword,
          role: 4, // SUPER_ADMIN
        },
      });
      accounts.push({
        email: superAdminEmail,
        nickname: "系统管理员",
        role: "SUPER_ADMIN",
        password: "123456",
      });
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
        role: 2, // ADMIN
        schoolId: testSchool.id,
      },
      {
        email: "staff@test.com",
        nickname: "测试工作人员",
        role: 3, // STAFF
        schoolId: testSchool.id,
      },
    ];

    for (const account of testAccounts) {
      const existing = await prisma.user.findFirst({
        where: { email: account.email },
      });

      if (!existing) {
        await prisma.user.create({
          data: {
            ...account,
            password: hashedPassword,
          },
        });
        accounts.push({
          email: account.email,
          nickname: account.nickname,
          role: account.role === 1 ? "STUDENT" : account.role === 2 ? "ADMIN" : "STAFF",
          password: "123456",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "测试账号初始化成功",
      accounts: accounts.length > 0 ? accounts : "所有账号已存在",
      summary: {
        superAdmin: {
          email: "admin@system.local",
          password: "123456",
          role: "SUPER_ADMIN",
        },
        testAccounts: [
          {
            email: "student@test.com",
            password: "123456",
            role: "STUDENT",
          },
          {
            email: "admin@test.com",
            password: "123456",
            role: "ADMIN",
          },
          {
            email: "staff@test.com",
            password: "123456",
            role: "STAFF",
          },
        ],
      },
    });
  } catch (error) {
    console.error("初始化测试账号失败:", error);
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

