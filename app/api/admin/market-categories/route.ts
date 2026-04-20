import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

/**
 * GET /api/admin/market-categories
 * 获取物品分类池 + 各交易类型的关联状态（仅超级管理员）
 * data: { categories: [...], typeLinks: { [categoryId]: number[] }, transactionTypes: [...] }
 */
export async function GET() {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const [categories, links, transactionTypes] = await Promise.all([
      prisma.marketCategory.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          order: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { marketItems: true } },
        },
      }),
      prisma.marketTypeCategory.findMany({
        select: { transactionTypeId: true, categoryId: true },
      }),
      prisma.marketTransactionType.findMany({
        orderBy: { order: "asc" },
        select: { id: true, name: true, code: true, order: true, isActive: true },
      }),
    ]);

    const typeLinks: Record<string, number[]> = {};
    for (const link of links) {
      if (!typeLinks[link.categoryId]) typeLinks[link.categoryId] = [];
      typeLinks[link.categoryId].push(link.transactionTypeId);
    }

    return NextResponse.json({
      success: true,
      data: {
        categories,
        typeLinks,
        transactionTypes,
      },
    });
  } catch (error) {
    console.error("获取集市分类列表失败:", error);
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

/**
 * POST /api/admin/market-categories
 * 创建物品分类（扁平，仅超级管理员）
 * body: { name, order? }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();
    const { name, order } = body as { name?: string; order?: number };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: "分类名称不能为空" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 50) {
      return NextResponse.json(
        { success: false, message: "分类名称过长（最多 50 字）" },
        { status: 400 }
      );
    }

    const existing = await prisma.marketCategory.findFirst({
      where: { name: trimmedName, isActive: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "已存在同名分类" },
        { status: 400 }
      );
    }

    const category = await prisma.marketCategory.create({
      data: {
        name: trimmedName,
        order: typeof order === "number" ? order : 0,
      },
    });

    return NextResponse.json({
      success: true,
      message: "创建成功",
      data: {
        id: category.id,
        name: category.name,
        order: category.order,
        isActive: category.isActive,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("创建集市分类失败:", error);
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
