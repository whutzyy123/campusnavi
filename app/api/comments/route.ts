import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { validateContent } from "@/lib/content-validator";

// 创建留言或获取留言列表

// GET /api/comments?poiId=xxx&page=1&limit=20
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poiId = searchParams.get("poiId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (!poiId) {
      return NextResponse.json(
        { success: false, message: "缺少必填参数：poiId" },
        { status: 400 }
      );
    }

    const skip = (page - 1) * limit;

    // 只统计顶级留言（parentId 为 null）用于分页
    const [total, topLevelComments] = await Promise.all([
      prisma.comment.count({
        where: {
          poiId,
          isHidden: false,
          parentId: null, // 只统计顶级留言用于分页
        },
      }),
      // 获取当前页的顶级留言
      prisma.comment.findMany({
        where: {
          poiId,
          isHidden: false,
          parentId: null, // 只查询顶级留言
        },
        orderBy: {
          createdAt: "desc", // 顶级留言按时间倒序
        },
        skip,
        take: limit,
        select: {
          id: true,
        },
      }),
    ]);

    // 获取当前页顶级留言的 ID 列表
    const topLevelCommentIds = topLevelComments.map((c) => c.id);

    if (topLevelCommentIds.length === 0) {
      return NextResponse.json({
        success: true,
        comments: [],
        pagination: {
          page,
          limit,
          total,
        },
      });
    }

    // 获取该 POI 下的所有留言（平铺结构，不限制层级）
    // 前端会通过 buildCommentTree 转换为树形结构
    const allComments = await prisma.comment.findMany({
      where: {
        poiId,
        isHidden: false,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
        parent: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc", // 按时间正序排列，便于前端构建树形结构
      },
    });

    // 过滤：只返回与当前页顶级留言相关的留言（包括其所有子回复）
    // 使用 Set 提高查找效率
    const topLevelIdsSet = new Set(topLevelCommentIds);
    const relevantComments = allComments.filter((c) => {
      // 如果是当前页的顶级留言，包含
      if (topLevelIdsSet.has(c.id)) return true;
      
      // 如果是某个当前页顶级留言的子回复，包含
      // 通过向上查找 parentId 链来判断
      let current = c;
      const visited = new Set<string>(); // 防止循环引用
      while (current.parentId) {
        if (visited.has(current.id)) break; // 检测到循环，退出
        visited.add(current.id);
        
        if (topLevelIdsSet.has(current.parentId)) return true;
        
        const parent = allComments.find((p) => p.id === current.parentId);
        if (!parent) break;
        current = parent;
      }
      return false;
    });

    // 将数据转换为前端需要的格式（平铺结构）
    const formattedComments = relevantComments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      reportCount: c.reportCount,
      isHidden: c.isHidden,
      parentId: c.parentId,
      user: {
        id: c.user.id,
        nickname: c.user.nickname,
        avatar: c.user.avatar,
      },
      parent: c.parent
        ? {
            id: c.parent.id,
            user: {
              id: c.parent.user.id,
              nickname: c.parent.user.nickname,
            },
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      comments: formattedComments, // 返回平铺结构，由前端转换为树形
      pagination: {
        page,
        limit,
        total,
      },
    });
  } catch (error) {
    console.error("获取留言列表失败:", error);
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

// POST /api/comments
// 仅登录用户可用
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json(
        { success: false, message: "未登录用户不能发表评论" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { poiId, content, parentId } = body as {
      poiId?: string;
      content?: string;
      parentId?: string;
    };

    if (!poiId || !content || !content.toString().trim()) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：poiId 或 content" },
        { status: 400 }
      );
    }

    const normalizedContent = content.toString().trim();
    if (normalizedContent.length > 500) {
      return NextResponse.json(
        { success: false, message: "留言内容过长（最多 500 字）" },
        { status: 400 }
      );
    }

    // 获取 POI 及学校信息
    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在" },
        { status: 404 }
      );
    }

    // 多租户权限校验：除超级管理员外，必须与自己 schoolId 一致
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId && auth.schoolId !== poi.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权对其他学校的 POI 发表评论" },
        { status: 403 }
      );
    }

    // 如果提供了 parentId，验证父留言是否存在且属于同一个 POI
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          poiId: true,
          schoolId: true,
          isHidden: true,
        },
      });

      if (!parentComment) {
        return NextResponse.json(
          { success: false, message: "父留言不存在" },
          { status: 404 }
        );
      }

      if (parentComment.poiId !== poiId) {
        return NextResponse.json(
          { success: false, message: "父留言与当前 POI 不匹配" },
          { status: 400 }
        );
      }

      // 确保多租户隔离
      if (parentComment.schoolId !== poi.schoolId) {
        return NextResponse.json(
          { success: false, message: "父留言与当前 POI 不属于同一学校" },
          { status: 403 }
        );
      }
    }

    // 敏感词校验
    try {
      await validateContent(normalizedContent);
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          message:
            err instanceof Error ? err.message : "内容包含不当词汇，请修改后重试",
        },
        { status: 400 }
      );
    }

    const comment = await prisma.comment.create({
      data: {
        content: normalizedContent,
        poiId: poi.id,
        schoolId: poi.schoolId,
        userId: auth.userId,
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
        parent: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        reportCount: comment.reportCount,
        isHidden: comment.isHidden,
        parentId: comment.parentId,
        user: {
          id: comment.user.id,
          nickname: comment.user.nickname,
          avatar: comment.user.avatar,
        },
        parent: comment.parent
          ? {
              id: comment.parent.id,
              user: {
                id: comment.parent.user.id,
                nickname: comment.parent.user.nickname,
              },
            }
          : null,
      },
    });
  } catch (error) {
    console.error("创建留言失败:", error);
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


