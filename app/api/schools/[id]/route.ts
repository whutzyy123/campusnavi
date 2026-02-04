import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/schools/:id
 * 获取单个学校信息（用于管理员/工作人员强制租户锁定）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        boundary: true,
        centerLat: true,
        centerLng: true,
        isActive: true,
      },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      school,
    });
  } catch (error) {
    console.error("获取学校信息失败:", error);
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
 * PUT /api/schools/:id
 * 更新学校信息
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: "学校名称不能为空" },
        { status: 400 }
      );
    }

    const school = await prisma.school.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "学校信息更新成功",
      school: {
        ...school,
        createdAt: school.createdAt.toISOString(),
        updatedAt: school.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新学校信息失败:", error);
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
 * DELETE /api/schools/:id
 * 删除学校（级联删除所有关联数据）
 * 危险操作：必须在事务中执行，严格按照顺序删除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 检查学校是否存在
    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        schoolCode: true,
      },
    });

    if (!school) {
      return NextResponse.json(
        { success: false, message: "学校不存在" },
        { status: 404 }
      );
    }

    // 在事务中执行级联删除
    await prisma.$transaction(async (tx) => {
      // 1. 删除该校 POI 关联的 LiveStatus
      await tx.liveStatus.deleteMany({
        where: {
          schoolId: params.id,
        },
      });

      // 2. 删除该校所有的 POI
      await tx.pOI.deleteMany({
        where: {
          schoolId: params.id,
        },
      });

      // 3. 删除该校所有的 RouteEdge
      await tx.routeEdge.deleteMany({
        where: {
          schoolId: params.id,
        },
      });

      // 4. 删除该校所有的 InvitationCode
      await tx.invitationCode.deleteMany({
        where: {
          schoolId: params.id,
        },
      });

      // 5. 删除该校所有的 User
      await tx.user.deleteMany({
        where: {
          schoolId: params.id,
        },
      });

      // 6. 最后删除 School 本身
      await tx.school.delete({
        where: { id: params.id },
      });
    });

    return NextResponse.json({
      success: true,
      message: `学校 "${school.name}" 及其所有关联数据已永久删除`,
    });
  } catch (error) {
    console.error("删除学校失败:", error);
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
