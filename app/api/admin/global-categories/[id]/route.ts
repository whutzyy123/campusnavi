import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

// DELETE /api/admin/global-categories/[id]
// 删除全局分类（仅超级管理员，需检查所有学校的 POI 占用）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const { id } = params;

    // 查找分类
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            pois: true,
          },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, message: "分类不存在" },
        { status: 404 }
      );
    }

    if (!category.isGlobal) {
      return NextResponse.json(
        { success: false, message: "该分类不是全局分类" },
        { status: 400 }
      );
    }

    // 检查是否有 POI 使用该分类
    if (category._count.pois > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `无法删除：该全局分类下仍有 ${category._count.pois} 个 POI，请先修改或删除这些 POI 后再删除分类`,
        },
        { status: 400 }
      );
    }

    // 删除全局分类（会级联删除所有覆盖记录）
    await prisma.category.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "全局分类已删除",
    });
  } catch (error) {
    console.error("删除全局分类失败:", error);
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

