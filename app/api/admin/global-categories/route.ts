import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";

// GET /api/admin/global-categories
// 获取所有全局分类（仅超级管理员）
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthCookie();

    if (!auth || auth.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "仅超级管理员可访问" },
        { status: 403 }
      );
    }

    // 获取分页参数
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const { skip, take } = getPaginationParams(page, limit);

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
        include: {
          _count: {
            select: {
              pois: true, // 统计所有学校的 POI
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        skip,
        take,
      }),
    ]);

    // 计算分页元数据
    const pagination = getPaginationMeta(total, page, limit);

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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST /api/admin/global-categories
// 创建全局分类（仅超级管理员）
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthCookie();

    if (!auth || auth.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "仅超级管理员可创建全局分类" },
        { status: 403 }
      );
    }

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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

