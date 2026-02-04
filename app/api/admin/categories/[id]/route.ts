import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server-actions";
import { upsertCategoryOverride } from "@/lib/category-utils";

// DELETE /api/admin/categories/[id]
// 删除分类（全局分类创建覆盖记录，私有分类物理删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();

    if (!auth.schoolId) {
      return NextResponse.json(
        { success: false, message: "当前管理员未绑定学校" },
        { status: 400 }
      );
    }

    const { id } = params;

    // 查找分类
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            pois: {
              where: {
                schoolId: auth.schoolId, // 只统计该学校的 POI
              },
            },
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

    // 如果是全局分类，创建覆盖记录（隐藏）
    if (category.isGlobal) {
      // 检查是否有 POI 使用该分类
      if (category._count.pois > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `无法隐藏：该分类下仍有 ${category._count.pois} 个 POI，请先修改或删除这些 POI 后再隐藏分类`,
          },
          { status: 400 }
        );
      }

      // 创建或更新覆盖记录，标记为隐藏
      await upsertCategoryOverride(auth.schoolId, category.id, true);

      return NextResponse.json({
        success: true,
        message: "全局分类已在该学校隐藏",
      });
    }

    // 如果是私有分类，进行物理删除
    // 多租户安全：确保只能删除自己学校的分类
    if (category.schoolId !== auth.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权删除其他学校的分类" },
        { status: 403 }
      );
    }

    // 检查是否有 POI 使用该分类
    if (category._count.pois > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `无法删除：该分类下仍有 ${category._count.pois} 个 POI，请先修改或删除这些 POI 后再删除分类`,
        },
        { status: 400 }
      );
    }

    // 删除分类
    await prisma.category.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "分类已删除",
    });
  } catch (error) {
    console.error("删除分类失败:", error);
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

