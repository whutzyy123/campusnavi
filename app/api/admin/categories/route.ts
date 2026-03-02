import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server-actions";
import { getMergedCategories } from "@/lib/category-utils";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

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

    const searchParams = request.nextUrl.searchParams;
    const all = searchParams.get("all") === "true";
    const grouped = searchParams.get("grouped") === "true";

    // 使用工具函数合并全局和私有分类
    let mergedCategories: Awaited<ReturnType<typeof getMergedCategories>>;
    try {
      mergedCategories = await getMergedCategories(auth.schoolId);
    } catch (error) {
      console.error("合并分类失败:", error);
      mergedCategories = [];
    }

    if (!Array.isArray(mergedCategories)) {
      console.error("getMergedCategories 返回了非数组类型:", typeof mergedCategories);
      mergedCategories = [];
    }

    // all=true&grouped=true：返回分组分类（常规 + 微观），用于 POI 表单下拉
    if (all && grouped) {
      const regular = mergedCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
      const microCategories = await prisma.category.findMany({
        where: { isMicroCategory: true, schoolId: null },
        select: { id: true, name: true, icon: true },
        orderBy: { createdAt: "asc" },
      });
      const micro = microCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
      return NextResponse.json({
        success: true,
        data: { regular, micro },
      });
    }

    // all=true：返回全部分类（用于下拉框），仅 id/name/icon，无分页
    if (all) {
      const lightCategories = mergedCategories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
      }));
      return NextResponse.json({
        success: true,
        data: lightCategories,
      });
    }

    // 分页模式：用于管理表格
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const total = mergedCategories.length;
    const { skip, take } = getPaginationParams(page, limit);
    const paginatedCategories = mergedCategories.slice(skip, skip + take);
    const pagination = getPaginationMeta(total, page, limit);

    return NextResponse.json({
      success: true,
      data: paginatedCategories,
      pagination,
    });
  } catch (error) {
    console.error("获取分类列表失败:", error);
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
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}

