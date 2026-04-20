import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/keywords
 * 获取所有屏蔽词列表（仅限超级管理员）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    // 获取分页和搜索参数
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const q = searchParams.get("q")?.trim() || "";
    const { skip, take } = getPaginationParams(page, limit);

    const where = q
      ? { keyword: { contains: q } }
      : {};

    // 并行查询：总数和分页数据
    const [total, keywords] = await Promise.all([
      prisma.sensitiveWord.count({ where }),
      prisma.sensitiveWord.findMany({
        where,
        select: {
          id: true,
          keyword: true,
          createdAt: true,
          addedBy: {
            select: {
              id: true,
              nickname: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
    ]);

    // 计算分页元数据
    const pagination = getPaginationMeta(total, page, limit);

    return NextResponse.json({
      success: true,
      data: keywords.map((kw) => ({
        id: kw.id,
        keyword: kw.keyword,
        createdAt: kw.createdAt.toISOString(),
        addedBy: {
          id: kw.addedBy.id,
          nickname: kw.addedBy.nickname || "未知",
        },
      })),
      pagination,
    });
  } catch (error) {
    console.error("获取屏蔽词列表失败:", error);
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
 * POST /api/keywords
 * 新增屏蔽词（仅限超级管理员）
 * 
 * 请求体：{ keyword: string }；addedById 使用当前会话用户
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    const body = await request.json();
    const { keyword } = body;

    // 验证必填字段
    if (!keyword) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：keyword" },
        { status: 400 }
      );
    }

    // 检查屏蔽词是否已存在
    const existing = await prisma.sensitiveWord.findUnique({
      where: { keyword: keyword.trim() },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: "该屏蔽词已存在" },
        { status: 400 }
      );
    }

    // 创建屏蔽词
    const sensitiveWord = await prisma.sensitiveWord.create({
      data: {
        keyword: keyword.trim(),
        addedById: auth.userId,
      },
      include: {
        addedBy: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "屏蔽词添加成功",
      keyword: {
        id: sensitiveWord.id,
        keyword: sensitiveWord.keyword,
        createdAt: sensitiveWord.createdAt.toISOString(),
        addedBy: {
          id: sensitiveWord.addedBy.id,
          nickname: sensitiveWord.addedBy.nickname || "未知",
        },
      },
    });
  } catch (error) {
    console.error("添加屏蔽词失败:", error);
    
    // 处理唯一约束冲突
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, message: "该屏蔽词已存在" },
        { status: 400 }
      );
    }

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
