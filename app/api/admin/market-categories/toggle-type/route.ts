import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

/**
 * POST /api/admin/market-categories/toggle-type
 * 切换物品分类与交易类型的关联（仅超级管理员）
 * body: { typeId: number, categoryId: string }
 * 若已关联则删除，未关联则创建
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();
    const { typeId, categoryId } = body as { typeId?: number; categoryId?: string };

    if (typeof typeId !== "number" || !Number.isInteger(typeId) || typeId <= 0) {
      return NextResponse.json(
        { success: false, message: "无效的交易类型 ID" },
        { status: 400 }
      );
    }

    if (!categoryId || !categoryId.trim()) {
      return NextResponse.json(
        { success: false, message: "分类 ID 不能为空" },
        { status: 400 }
      );
    }

    const category = await prisma.marketCategory.findUnique({
      where: { id: categoryId.trim() },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, message: "分类不存在" },
        { status: 404 }
      );
    }

    const transactionType = await prisma.marketTransactionType.findUnique({
      where: { id: typeId },
    });

    if (!transactionType) {
      return NextResponse.json(
        { success: false, message: "交易类型不存在" },
        { status: 404 }
      );
    }

    const existing = await prisma.marketTypeCategory.findUnique({
      where: {
        transactionTypeId_categoryId: {
          transactionTypeId: typeId,
          categoryId: category.id,
        },
      },
    });

    if (existing) {
      await prisma.marketTypeCategory.delete({
        where: {
          transactionTypeId_categoryId: {
            transactionTypeId: typeId,
            categoryId: category.id,
          },
        },
      });
      return NextResponse.json({
        success: true,
        message: "已取消关联",
        data: { linked: false },
      });
    } else {
      await prisma.marketTypeCategory.create({
        data: {
          transactionTypeId: typeId,
          categoryId: category.id,
        },
      });
      return NextResponse.json({
        success: true,
        message: "已关联",
        data: { linked: true },
      });
    }
  } catch (error) {
    console.error("切换交易类型关联失败:", error);
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
