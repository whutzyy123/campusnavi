import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server-actions";
import { upsertCategoryOverride, removeCategoryOverride } from "@/lib/category-utils";

// PATCH /api/admin/categories/[id]/override
// 创建或更新分类覆盖（隐藏或修改名称）
export async function PATCH(
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
    const body = await request.json();
    const { isHidden, customName } = body as {
      isHidden?: boolean;
      customName?: string | null;
    };

    // 验证分类是否存在且为全局分类
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, message: "分类不存在" },
        { status: 404 }
      );
    }

    if (!category.isGlobal) {
      return NextResponse.json(
        { success: false, message: "只能覆盖全局分类，私有分类不支持此操作" },
        { status: 400 }
      );
    }

    // 如果同时设置 isHidden: true 和 customName，优先隐藏
    if (isHidden === true) {
      await upsertCategoryOverride(auth.schoolId, category.id, true, null);
      return NextResponse.json({
        success: true,
        message: "全局分类已在该学校隐藏",
      });
    }

    // 如果设置自定义名称
    if (customName !== undefined) {
      if (customName && customName.trim().length > 50) {
        return NextResponse.json(
          { success: false, message: "自定义名称过长（最多 50 字）" },
          { status: 400 }
        );
      }

      await upsertCategoryOverride(
        auth.schoolId,
        category.id,
        false,
        customName?.trim() || null
      );

      return NextResponse.json({
        success: true,
        message: customName ? "分类名称已自定义" : "已恢复为默认名称",
      });
    }

    return NextResponse.json(
      { success: false, message: "请提供 isHidden 或 customName 参数" },
      { status: 400 }
    );
  } catch (error) {
    console.error("更新分类覆盖失败:", error);
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

// DELETE /api/admin/categories/[id]/override
// 删除分类覆盖（恢复全局分类的默认显示）
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

    // 验证分类是否存在且为全局分类
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, message: "分类不存在" },
        { status: 404 }
      );
    }

    if (!category.isGlobal) {
      return NextResponse.json(
        { success: false, message: "只能恢复全局分类的覆盖" },
        { status: 400 }
      );
    }

    // 删除覆盖记录
    await removeCategoryOverride(auth.schoolId, category.id);

    return NextResponse.json({
      success: true,
      message: "已恢复为默认显示",
    });
  } catch (error) {
    console.error("删除分类覆盖失败:", error);
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

