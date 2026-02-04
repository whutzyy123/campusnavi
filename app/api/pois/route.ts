import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CoordinateConverter } from "@/lib/amap-loader";
import { validateContent } from "@/lib/content-validator";
import { calculateStatusStatistics } from "@/lib/poi-utils";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";
import { getMergedCategories } from "@/lib/category-utils";

/**
 * GET /api/pois
 * 根据 schoolId 获取 POI 列表
 * 
 * 查询参数：
 * - schoolId: 学校 ID（必填）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const schoolId = searchParams.get("schoolId");

    if (!schoolId) {
      return NextResponse.json(
        { success: false, message: "缺少必填参数：schoolId" },
        { status: 400 }
      );
    }

    // 获取分页参数（可选，用于管理后台）
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");
    const isPaginated = page && limit;
    
    const where = {
      schoolId,
      reportCount: {
        lt: 3, // 举报次数小于 3 的才显示
      },
    };

    let pois;
    let total = 0;

    if (isPaginated) {
      // 分页模式（管理后台）
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const { skip, take } = getPaginationParams(pageNum, limitNum);

      [total, pois] = await Promise.all([
        prisma.pOI.count({ where }),
        prisma.pOI.findMany({
          where,
          include: {
            categoryRef: {
              select: {
                id: true,
                name: true,
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
    } else {
      // 非分页模式（地图展示）
      pois = await prisma.pOI.findMany({
        where,
        include: {
          categoryRef: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    // 获取合并后的分类列表（应用覆盖逻辑）
    const mergedCategories = await getMergedCategories(schoolId);
    const categoryMap = new Map(mergedCategories.map((cat) => [cat.id, cat]));

    // 获取每个 POI 的状态统计（基于过去15分钟内的所有上报）
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const poisWithStatus = await Promise.all(
      pois.map(async (poi) => {
        // 查询过去15分钟内的所有有效状态记录
        const recentStatuses = await prisma.liveStatus.findMany({
          where: {
            poiId: poi.id,
            schoolId, // 确保多租户隔离
            expiresAt: {
              gt: now, // 未过期
            },
            createdAt: {
              gte: fifteenMinutesAgo, // 过去15分钟内
            },
          },
          select: {
            val: true,
            statusType: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // 使用统计算法计算综合状态
        const statistics = calculateStatusStatistics(recentStatuses);

        // 获取分类显示名称（应用覆盖逻辑）
        let categoryName = poi.category || "其他";
        if (poi.categoryId) {
          const mergedCategory = categoryMap.get(poi.categoryId);
          if (mergedCategory) {
            categoryName = mergedCategory.name; // 使用覆盖后的名称
          }
        }

        return {
          id: poi.id,
          schoolId: poi.schoolId,
          name: poi.name,
          category: categoryName, // 应用覆盖逻辑后的分类名称
          categoryId: poi.categoryId, // 返回分类ID
          lat: poi.lat,
          lng: poi.lng,
          isOfficial: poi.isOfficial,
          description: poi.description,
          reportCount: poi.reportCount,
          createdAt: poi.createdAt.toISOString(),
          updatedAt: poi.updatedAt.toISOString(),
          currentStatus:
            recentStatuses.length > 0
            ? {
                  statusType: recentStatuses[0].statusType, // 使用第一条记录的statusType
                  val: statistics.val, // 使用计算后的综合状态值
                  expiresAt: recentStatuses[0].expiresAt.toISOString(), // 使用第一条记录的过期时间
                  updatedAt: recentStatuses[0].createdAt.toISOString(), // 最后更新时间
                  sampleCount: statistics.sampleCount, // 样本数量
              }
              : undefined, // 如果没有记录，返回undefined（前端会显示默认值）
        };
      })
    );

    if (isPaginated) {
      // 分页模式：返回分页数据
      const pageNum = parseInt(page!, 10);
      const limitNum = parseInt(limit!, 10);
      const pagination = getPaginationMeta(total, pageNum, limitNum);

      return NextResponse.json({
        success: true,
        data: poisWithStatus,
        pagination,
      });
    } else {
      // 非分页模式：返回所有数据
      return NextResponse.json({
        success: true,
        pois: poisWithStatus,
      });
    }
  } catch (error) {
    console.error("获取 POI 列表失败:", error);
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

/**
 * POST /api/pois
 * 创建新 POI（管理员录入）
 * 
 * 请求体：
 * {
 *   schoolId: string,
 *   name: string,
 *   category: string,
 *   lat: number,
 *   lng: number,
 *   description?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schoolId, name, categoryId, category, lat, lng, description } = body;

    // 验证必填字段
    if (!schoolId || !name || (!categoryId && !category) || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：schoolId, name, categoryId (或 category), lat, lng" },
        { status: 400 }
      );
    }

    // 兼容旧数据：如果传入了 category 字符串，尝试查找对应的分类
    let finalCategoryId: string | null = categoryId || null;
    let finalCategoryName: string | null = category || null;

    if (categoryId) {
      // 使用 categoryId，验证分类是否存在且属于该学校（或为全局分类）
      const categoryRecord = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, schoolId: true, name: true, isGlobal: true },
      });

      if (!categoryRecord) {
        return NextResponse.json(
          { success: false, message: "分类不存在" },
          { status: 404 }
        );
      }

      // 验证分类权限：
      // 1. 全局分类（isGlobal === true）可以被任何学校使用
      // 2. 私有分类（isGlobal === false）只能被所属学校使用
      const isAllowed = categoryRecord.isGlobal || categoryRecord.schoolId === schoolId;

      if (!isAllowed) {
        return NextResponse.json(
          { success: false, message: "分类无效或无权使用" },
          { status: 403 }
        );
      }

      // 如果是全局分类，检查该学校是否在 CategoryOverride 中将其标记为隐藏
      if (categoryRecord.isGlobal) {
        const override = await prisma.categoryOverride.findUnique({
          where: {
            schoolId_categoryId: {
              schoolId: schoolId,
              categoryId: categoryRecord.id,
            },
          },
          select: { isHidden: true },
        });

        if (override?.isHidden) {
          return NextResponse.json(
            { success: false, message: "该分类已被隐藏，无法使用" },
            { status: 403 }
          );
        }
      }

      finalCategoryId = categoryRecord.id;
      finalCategoryName = categoryRecord.name;
    } else if (category) {
      // 兼容旧逻辑：如果只传了 category 字符串，尝试查找或使用旧字段
      // 为了向后兼容，暂时允许直接使用 category 字符串
      finalCategoryName = category;
    }

    // 验证坐标
    try {
      CoordinateConverter.formatCoordinate(lng, lat);
    } catch (error) {
      return NextResponse.json(
        { success: false, message: "坐标格式错误" },
        { status: 400 }
      );
    }

    // 校验内容是否包含屏蔽词
    try {
      await validateContent(name);
      if (description) {
        await validateContent(description);
      }
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "内容包含不当词汇，请修改后重试",
        },
        { status: 400 }
      );
    }

    // 验证学校是否存在
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 创建 POI（isOfficial 设为 true，因为是管理员录入）
    const poi = await prisma.pOI.create({
      data: {
        schoolId,
        name: name.trim(),
        categoryId: finalCategoryId,
        category: finalCategoryName, // 保留旧字段用于兼容
        lat,
        lng,
        description: description?.trim() || null,
        isOfficial: true,
        reportCount: 0,
      },
    });

    return NextResponse.json({
      success: true,
      message: "POI 创建成功",
      poi: {
        id: poi.id,
        schoolId: poi.schoolId,
        name: poi.name,
        category: poi.category,
        lat: poi.lat,
        lng: poi.lng,
        isOfficial: poi.isOfficial,
        description: poi.description,
        reportCount: poi.reportCount,
        createdAt: poi.createdAt.toISOString(),
        updatedAt: poi.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("创建 POI 失败:", error);
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

