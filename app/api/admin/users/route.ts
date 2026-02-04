import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";

/**
 * GET /api/admin/users
 * 获取所有用户数据（仅限超级管理员）
 * 
 * 查询参数：
 * - role: 角色筛选（可选）
 * - schoolId: 学校筛选（可选）
 */
export async function GET(request: NextRequest) {
  try {
    // 从请求头或 Cookie 中获取当前用户信息
    // 注意：在实际生产环境中，应该使用 JWT token 或 session
    const authHeader = request.headers.get("authorization");
    
    // 这里我们需要从 Cookie 中获取用户信息（Zustand persist）
    // 由于 middleware 的限制，我们暂时从请求体中获取 userId
    // 实际项目中应该使用更安全的认证方式
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "未授权" },
        { status: 401 }
      );
    }

    // 验证当前用户是否为超级管理员
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      );
    }

    // 只有超级管理员（role = 4）才能访问
    if (currentUser.role !== 4) {
      return NextResponse.json(
        { success: false, message: "权限不足，仅限超级管理员访问" },
        { status: 403 }
      );
    }

    // 获取筛选参数
    const roleFilter = searchParams.get("role");
    const schoolIdFilter = searchParams.get("schoolId");
    const search = searchParams.get("search");
    const searchField = searchParams.get("field") === "email" ? "email" : "nickname";

    // 构建查询条件
    const whereConditions: any[] = [];
    
    // 角色筛选
    if (roleFilter) {
      // 角色映射：STUDENT=1, ADMIN=2, STAFF=3, SUPER_ADMIN=4
      const roleMap: Record<string, number> = {
        STUDENT: 1,
        ADMIN: 2,
        STAFF: 3,
        SUPER_ADMIN: 4,
      };
      if (roleMap[roleFilter]) {
        whereConditions.push({ role: roleMap[roleFilter] });
      }
    }

    // 学校筛选
    if (schoolIdFilter) {
      if (schoolIdFilter === "null") {
        whereConditions.push({ schoolId: null });
      } else {
        whereConditions.push({ schoolId: schoolIdFilter });
      }
    }

    // 搜索功能：根据指定字段进行模糊搜索
    if (search && search.trim()) {
      whereConditions.push({
        [searchField]: { contains: search.trim() },
      });
    }

    // 构建最终的 where 条件
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // 获取分页参数
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const { skip, take } = getPaginationParams(page, limit);

    // 并行查询：总数和分页数据
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          school: {
            select: {
              id: true,
              name: true,
              schoolCode: true,
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

    // 格式化返回数据
    const formattedUsers = users.map((user) => {
      // 角色映射：1=STUDENT, 2=ADMIN, 3=STAFF, 4=SUPER_ADMIN
      const roleMap: Record<number, string> = {
        1: "STUDENT",
        2: "ADMIN",
        3: "STAFF",
        4: "SUPER_ADMIN",
      };

      return {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        role: roleMap[user.role] || "UNKNOWN",
        roleNumber: user.role,
        schoolId: user.schoolId,
        schoolName: user.school?.name || "系统",
        schoolCode: user.school?.schoolCode || null,
        createdAt: user.createdAt.toISOString(),
        status: "active", // User 模型目前没有 status 字段，默认为 active
      };
    });

    // 计算分页元数据
    const pagination = getPaginationMeta(total, page, limit);

    return NextResponse.json({
      success: true,
      data: formattedUsers,
      pagination,
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
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


