import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-utils";
import { requireSeedBearerIfConfigured } from "@/lib/seed-route-auth";

/**
 * POST /api/auth/seed
 * 初始化超级管理员账号（仅用于开发环境）
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
    // 检查是否已存在超级管理员
    const existingSuperAdmin = await prisma.user.findFirst({
      where: {
        role: 4, // SUPER_ADMIN
      },
    });

    if (existingSuperAdmin) {
      return NextResponse.json({
        success: false,
        message: "超级管理员已存在",
      });
    }

    // 创建系统学校（如果不存在）
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

    // 创建超级管理员（schoolId 为 null，与学校租户解耦）
    const password = "123456";
    const hashedPassword = await hashPassword(password);

    const superAdmin = await prisma.user.create({
      data: {
        schoolId: null, // 超级管理员不绑定学校
        nickname: "系统管理员",
        email: "admin@system.local",
        password: hashedPassword,
        role: 4, // SUPER_ADMIN
      },
    });

    return NextResponse.json({
      success: true,
      message: "超级管理员创建成功",
      user: {
        id: superAdmin.id,
        email: superAdmin.email,
        nickname: superAdmin.nickname,
        role: "SUPER_ADMIN",
      },
      credentials: {
        email: "admin@system.local",
        password: "123456",
      },
    });
  } catch (error) {
    console.error("初始化超级管理员失败:", error);
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

