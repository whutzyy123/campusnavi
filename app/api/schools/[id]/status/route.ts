import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/schools/:id/status
 * 停用/激活学校
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { isActive } = body;

    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "isActive 必须是布尔值" },
        { status: 400 }
      );
    }

    const school = await prisma.school.update({
      where: { id: params.id },
      data: {
        isActive,
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: isActive ? "学校已激活" : "学校已停用",
      school,
    });
  } catch (error) {
    console.error("更新学校状态失败:", error);
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

