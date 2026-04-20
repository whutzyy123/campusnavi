import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/school
 * 创建新学校（仅名称和代码，边界由 School Admin 在 CampusArea 中绘制）
 *
 * 请求体：
 * {
 *   name: string,
 *   schoolCode: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();
    const { name, schoolCode } = body;

    // 验证必填字段
    if (!name || !schoolCode) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：name, schoolCode" },
        { status: 400 }
      );
    }

    // 验证学校代码格式（仅小写字母和数字）
    if (!/^[a-z0-9]+$/.test(schoolCode)) {
      return NextResponse.json(
        { success: false, message: "学校代码只能包含小写字母和数字" },
        { status: 400 }
      );
    }

    // 检查学校代码是否已存在
    const existingSchool = await prisma.school.findUnique({
      where: { schoolCode: schoolCode.trim().toLowerCase() },
    });

    if (existingSchool) {
      return NextResponse.json(
        { success: false, message: `学校代码 "${schoolCode}" 已存在` },
        { status: 409 }
      );
    }

    // 保存到数据库（无 boundary 和 center，由 School Admin 后续在 CampusArea 中配置）
    const school = await prisma.school.create({
      data: {
        name: name.trim(),
        schoolCode: schoolCode.trim().toLowerCase(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "学校创建成功",
      data: {
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
      },
    });
  } catch (error) {
    console.error("创建学校失败:", error);
    
    // 处理 Prisma 唯一约束错误
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, message: "学校代码已存在" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: "服务器内部错误", error: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

