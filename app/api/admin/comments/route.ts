import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server-actions";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";

// GET /api/admin/comments
// 获取本校所有有举报或已隐藏的留言
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
    const { skip, take } = getPaginationParams(page, limit);

    const where = {
      schoolId: auth.schoolId,
      reportCount: { gt: 0 }, // 关键：只看被举报的留言
    };

    // 并行查询：总数和分页数据
    const [total, comments] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
            },
          },
          poi: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
        orderBy: {
          reportCount: "desc", // 按举报次数降序排列，优先处理严重问题
        },
        skip,
        take,
      }),
    ]);

    // 计算分页元数据
    const pagination = getPaginationMeta(total, page, limit);

    return NextResponse.json({
      success: true,
      data: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        reportCount: c.reportCount,
        isHidden: c.isHidden,
        user: {
          id: c.user.id,
          nickname: c.user.nickname,
          avatar: c.user.avatar,
        },
        poi: {
          id: c.poi.id,
          name: c.poi.name,
          category: c.poi.category,
        },
      })),
      pagination,
    });
  } catch (error) {
    console.error("获取审核留言列表失败:", error);
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


