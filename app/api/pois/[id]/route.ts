import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CoordinateConverter } from "@/lib/amap-loader";
import { validateContent } from "@/lib/content-validator";
import { requireAdmin } from "@/lib/auth-server-actions";

/**
 * GET /api/pois/:id
 * 获取单个 POI 详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const poi = await prisma.pOI.findUnique({
      where: { id: params.id },
      include: {
        categoryRef: {
          select: {
            id: true,
            name: true,
            isGlobal: true,
            schoolId: true,
          },
        },
        school: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      poi: {
        id: poi.id,
        schoolId: poi.schoolId,
        name: poi.name,
        categoryId: poi.categoryId,
        category: poi.categoryRef?.name || poi.category || "其他",
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
    console.error("获取 POI 详情失败:", error);
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
 * PUT /api/pois/:id
 * 更新 POI 信息（仅限管理员）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();

    // 查找 POI
    const poi = await prisma.pOI.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        schoolId: true,
        name: true,
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在" },
        { status: 404 }
      );
    }

    // 权限检查：校级管理员只能编辑所属学校的 POI
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== poi.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权编辑其他学校的 POI" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      categoryId,
      description,
      lat,
      lng,
      isOfficial,
      statusOverride,
    } = body;

    // 构建更新数据
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (categoryId !== undefined) {
      // 验证分类是否存在
      if (categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          select: { id: true, name: true, schoolId: true, isGlobal: true },
        });

        if (!category) {
          return NextResponse.json(
            { success: false, message: "分类不存在" },
            { status: 404 }
          );
        }

        // 验证分类是否属于该学校（全局分类或学校私有分类）
        if (!category.isGlobal && category.schoolId !== poi.schoolId) {
          return NextResponse.json(
            { success: false, message: "分类不属于该学校" },
            { status: 403 }
          );
        }

        updateData.categoryId = categoryId;
        updateData.category = category.name; // 保留旧字段用于兼容
      } else {
        updateData.categoryId = null;
      }
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (lat !== undefined && lng !== undefined) {
      // 验证坐标
      try {
        CoordinateConverter.formatCoordinate(lng, lat);
        updateData.lat = lat;
        updateData.lng = lng;
      } catch (error) {
        return NextResponse.json(
          { success: false, message: "坐标格式错误" },
          { status: 400 }
        );
      }
    }

    if (isOfficial !== undefined) {
      updateData.isOfficial = Boolean(isOfficial);
    }

    // 校验内容是否包含屏蔽词
    if (updateData.name) {
      try {
        await validateContent(updateData.name);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: error instanceof Error ? error.message : "内容包含不当词汇，请修改后重试",
          },
          { status: 400 }
        );
      }
    }

    if (updateData.description) {
      try {
        await validateContent(updateData.description);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: error instanceof Error ? error.message : "内容包含不当词汇，请修改后重试",
          },
          { status: 400 }
        );
      }
    }

    // 更新 POI
    const updatedPOI = await prisma.pOI.update({
      where: { id: params.id },
      data: updateData,
      include: {
        categoryRef: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // 如果提供了状态覆盖，创建或更新 LiveStatus
    if (statusOverride && statusOverride.val && statusOverride.statusType) {
      const expiresAt = statusOverride.expiresAt
        ? new Date(statusOverride.expiresAt)
        : new Date(Date.now() + 60 * 60 * 1000); // 默认1小时后过期

      await prisma.liveStatus.create({
        data: {
          poiId: params.id,
          schoolId: poi.schoolId,
          userId: auth.userId,
          statusType: statusOverride.statusType,
          val: statusOverride.val,
          expiresAt,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "POI 更新成功",
      poi: {
        id: updatedPOI.id,
        schoolId: updatedPOI.schoolId,
        name: updatedPOI.name,
        categoryId: updatedPOI.categoryId,
        category: updatedPOI.categoryRef?.name || updatedPOI.category || "其他",
        lat: updatedPOI.lat,
        lng: updatedPOI.lng,
        isOfficial: updatedPOI.isOfficial,
        description: updatedPOI.description,
        reportCount: updatedPOI.reportCount,
        createdAt: updatedPOI.createdAt.toISOString(),
        updatedAt: updatedPOI.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新 POI 失败:", error);
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
 * DELETE /api/pois/:id
 * 删除 POI（仅限管理员）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 获取当前登录用户（必须是管理员）
    const auth = await requireAdmin();

    // 查找 POI
    const poi = await prisma.pOI.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        schoolId: true,
        name: true,
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在" },
        { status: 404 }
      );
    }

    // 权限检查：校级管理员只能删除所属学校的 POI，超级管理员可以删除任何 POI
    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== poi.schoolId) {
      return NextResponse.json(
        { success: false, message: "无权删除其他学校的 POI" },
        { status: 403 }
      );
    }

    // 执行删除
    await prisma.pOI.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: "POI 删除成功",
    });
  } catch (error) {
    console.error("删除 POI 失败:", error);
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