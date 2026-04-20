import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";
import { getPaginationMeta } from "@/lib/utils";

// GET /api/admin/global-categories
// 获取所有全局分类（仅超级管理员）
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    // 分页：固定每页 10 条
    const PAGE_SIZE = 10;
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const skip = (page - 1) * PAGE_SIZE;

    // 并行查询：总数和分页数据
    const [total, categories] = await Promise.all([
      prisma.category.count({
        where: {
          isGlobal: true,
          schoolId: null,
        },
      }),
      prisma.category.findMany({
        where: {
          isGlobal: true,
          schoolId: null,
        },
        select: {
          id: true,
          name: true,
          icon: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              pois: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        skip,
        take: PAGE_SIZE,
      }),
    ]);

    // 计算分页元数据（total 用于前端分页组件计算总页数）
    const pagination = getPaginationMeta(total, page, PAGE_SIZE);

    return NextResponse.json({
      success: true,
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        poiCount: c._count.pois,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      pagination,
    });
  } catch (error) {
    console.error("获取全局分类列表失败:", error);
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

// POST /api/admin/global-categories
// 创建全局分类（仅超级管理员）
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();
    const { name, icon } = body as {
      name?: string;
      icon?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: "分类名称不能为空" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // 检查分类名称长度
    if (trimmedName.length > 50) {
      return NextResponse.json(
        { success: false, message: "分类名称过长（最多 50 字）" },
        { status: 400 }
      );
    }

    // 检查是否已存在同名全局分类
    // 使用 findFirst 替代 findUnique，因为 Prisma 不支持在复合唯一索引中使用 null
    const existing = await prisma.category.findFirst({
      where: {
        isGlobal: true,
        schoolId: null,
        name: trimmedName,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: "该全局分类名称已存在" },
        { status: 400 }
      );
    }

    // 创建全局分类
    const category = await prisma.category.create({
      data: {
        schoolId: null,
        name: trimmedName,
        icon: icon?.trim() || null,
        isGlobal: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "全局分类创建成功",
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("创建全局分类失败:", error);
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

