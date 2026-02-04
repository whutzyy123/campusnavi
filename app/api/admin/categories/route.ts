import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server-actions";
import { getMergedCategories } from "@/lib/category-utils";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";

// GET /api/admin/categories
// 获取当前学校的分类（合并全局分类和私有分类，应用覆盖逻辑）
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();

    if (!auth.schoolId) {
      return NextResponse.json(
        { success: false, message: "当前管理员未绑定学校" },
        { status: 400 }
      );
    }

    // 获取分页参数
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // 使用工具函数合并全局和私有分类
    // 确保始终返回数组，即使发生错误也返回空数组
    let mergedCategories: Awaited<ReturnType<typeof getMergedCategories>>;
    try {
      mergedCategories = await getMergedCategories(auth.schoolId);
    } catch (error) {
      console.error("合并分类失败:", error);
      mergedCategories = []; // 确保始终是数组
    }

    // 防御性检查：确保 mergedCategories 是数组
    if (!Array.isArray(mergedCategories)) {
      console.error("getMergedCategories 返回了非数组类型:", typeof mergedCategories);
      mergedCategories = [];
    }

    // 计算分页
    const total = mergedCategories.length;
    const { skip, take } = getPaginationParams(page, limit);
    const paginatedCategories = mergedCategories.slice(skip, skip + take);

    // 计算分页元数据
    const pagination = getPaginationMeta(total, page, limit);

    return NextResponse.json({
      success: true,
      data: paginatedCategories, // 确保始终是数组
      pagination,
    });
  } catch (error) {
    console.error("获取分类列表失败:", error);
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

// POST /api/admin/categories
// 创建新分类
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    const { prisma } = await import("@/lib/prisma");

    const body = await request.json();
    const { name, icon, isGlobal } = body as {
      name?: string;
      icon?: string;
      isGlobal?: boolean;
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

    // 权限校验：只有超级管理员可以创建全局分类
    const finalIsGlobal = isGlobal === true;
    if (finalIsGlobal && auth.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "无权创建全局分类，仅超级管理员可操作" },
        { status: 403 }
      );
    }

    // 如果是全局分类，schoolId 必须为 null
    const finalSchoolId = finalIsGlobal ? null : auth.schoolId;

    if (!finalIsGlobal && !finalSchoolId) {
      return NextResponse.json(
        { success: false, message: "当前管理员未绑定学校" },
        { status: 400 }
      );
    }

    // 检查是否已存在同名分类
    // 如果是全局分类（schoolId 为 null），使用 findFirst；否则使用 findUnique
    const existing = finalIsGlobal
      ? await prisma.category.findFirst({
          where: {
            isGlobal: true,
            schoolId: null,
            name: trimmedName,
          },
        })
      : await prisma.category.findUnique({
          where: {
            schoolId_name: {
              schoolId: finalSchoolId!,
              name: trimmedName,
            },
          },
        });

    if (existing) {
      return NextResponse.json(
        { success: false, message: "该分类名称已存在" },
        { status: 400 }
      );
    }

    // 创建分类
    const category = await prisma.category.create({
      data: {
        schoolId: finalSchoolId,
        name: trimmedName,
        icon: icon?.trim() || null,
        isGlobal: finalIsGlobal,
      },
    });

    return NextResponse.json({
      success: true,
      message: "分类创建成功",
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        isGlobal: category.isGlobal,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("创建分类失败:", error);
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

