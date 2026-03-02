import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

/**
 * PUT /api/admin/market-categories/[id]
 * 更新物品分类（仅超级管理员）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "仅超级管理员可更新" },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { name, order, isActive } = body as {
      name?: string;
      order?: number;
      isActive?: boolean;
    };

    const existing = await prisma.marketCategory.findUnique({
      where: { id },
      include: { _count: { select: { marketItems: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "分类不存在" },
        { status: 404 }
      );
    }

    const updates: { name?: string; order?: number; isActive?: boolean } = {};

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { success: false, message: "分类名称不能为空" },
          { status: 400 }
        );
      }
      if (trimmed.length > 50) {
        return NextResponse.json(
          { success: false, message: "分类名称过长（最多 50 字）" },
          { status: 400 }
        );
      }
      updates.name = trimmed;
    }

    if (order !== undefined) updates.order = order;
    if (isActive !== undefined) updates.isActive = isActive;

    const updated = await prisma.marketCategory.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({
      success: true,
      message: "更新成功",
      data: {
        id: updated.id,
        name: updated.name,
        order: updated.order,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新集市分类失败:", error);
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
 * DELETE /api/admin/market-categories/[id]
 * 删除物品分类（仅超级管理员）
 * 有关联商品时禁止删除
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "仅超级管理员可删除" },
        { status: 403 }
      );
    }

    const { id } = params;

    const category = await prisma.marketCategory.findUnique({
      where: { id },
      include: { _count: { select: { marketItems: true } } },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, message: "分类不存在" },
        { status: 404 }
      );
    }

    if (category._count.marketItems > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `无法删除：该分类下仍有 ${category._count.marketItems} 个商品，请先处理这些商品`,
        },
        { status: 400 }
      );
    }

    await prisma.marketCategory.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "删除成功",
    });
  } catch (error) {
    console.error("删除集市分类失败:", error);
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
