import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteSchoolCascade } from "@/lib/school/delete-school-db";
import { requireSchoolAdminJson, requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/schools/:id
 * 获取单个学校信息（用于管理员/工作人员强制租户锁定）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireSchoolAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== params.id) {
      return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        schoolCode: true,
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
        error: error instanceof Error ? error.message : "未知错误",
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
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

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
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schools/:id
 * 删除学校（依赖 schema 中级联删除）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

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

    await deleteSchoolCascade(params.id);

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
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
