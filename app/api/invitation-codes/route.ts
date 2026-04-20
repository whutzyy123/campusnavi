import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateInvitationCode } from "@/lib/auth-utils";
import { requireAdminOrSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * POST /api/invitation-codes
 * 生成邀请码
 * 
 * 请求体：
 * {
 *   schoolId: string,
 *   role: number, // 2: 校级管理员, 3: 校内工作人员
 *   expiresAt?: string // 可选过期时间
 * }
 * createdByUserId 取当前登录用户，勿传发放人 ID
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminOrSuperAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    const body = await request.json();
    const { schoolId, role, expiresAt } = body;

    // 验证必填字段
    if (!schoolId || role === undefined) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：schoolId, role" },
        { status: 400 }
      );
    }

    // 验证角色（2: 校级管理员, 3: 校内工作人员）
    if (![2, 3].includes(role)) {
      return NextResponse.json(
        { success: false, message: "无效的角色，必须是 2（校级管理员）或 3（校内工作人员）" },
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

    const isSuperAdmin = auth.role === "SUPER_ADMIN";
    if (!isSuperAdmin && auth.schoolId !== schoolId) {
      return NextResponse.json(
        { success: false, message: "无权为该学校生成邀请码" },
        { status: 403 }
      );
    }

    // 生成唯一邀请码
    let code: string;
    let attempts = 0;
    do {
      code = generateInvitationCode();
      const existing = await prisma.invitationCode.findUnique({
        where: { code },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        return NextResponse.json(
          { success: false, message: "生成邀请码失败，请重试" },
          { status: 500 }
        );
      }
    } while (true);

    // 创建邀请码：role 2 -> ADMIN, 3 -> STAFF
    const type = role === 2 ? "ADMIN" : "STAFF";
    const invitationCode = await prisma.invitationCode.create({
      data: {
        code,
        type,
        schoolId,
        createdByUserId: auth.userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "邀请码生成成功",
      invitationCode: {
        id: invitationCode.id,
        code: invitationCode.code,
        type: invitationCode.type,
        schoolId: invitationCode.schoolId,
        schoolName: school.name,
        expiresAt: invitationCode.expiresAt?.toISOString() || null,
        createdAt: invitationCode.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("生成邀请码失败:", error);
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
 * GET /api/invitation-codes
 * 获取邀请码列表
 * 
 * 查询参数：
 * - schoolId: 学校ID（可选）
 * - issuerId: 发放人ID（可选）
 * - isUsed: 是否已使用（可选）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminOrSuperAdminJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    const searchParams = request.nextUrl.searchParams;
    const schoolIdParam = searchParams.get("schoolId");
    const issuerId = searchParams.get("issuerId");
    const isUsed = searchParams.get("isUsed");

    const where: Record<string, unknown> = {};
    const isSuperAdmin = auth.role === "SUPER_ADMIN";
    const schoolId = isSuperAdmin ? schoolIdParam : auth.schoolId;
    if (schoolId) where.schoolId = schoolId;
    if (issuerId) {
      if (isSuperAdmin || issuerId === auth.userId) {
        where.createdByUserId = issuerId;
      } else {
        return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
      }
    }
    if (isUsed != null && isUsed !== "") {
      where.status = isUsed === "true" ? "USED" : "ACTIVE";
    }

    const invitationCodes = await prisma.invitationCode.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            nickname: true,
          },
        },
        usedByUser: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      invitationCodes: invitationCodes.map((ic) => {
        const now = new Date();
        const isExpired = ic.expiresAt ? new Date(ic.expiresAt) < now : false;
        const statusStr = ic.status === "USED" ? "used" : isExpired ? "expired" : "unused";

        return {
          id: ic.id,
          code: ic.code,
          type: ic.type,
          typeName: ic.type === "ADMIN" ? "校级管理员" : ic.type === "STAFF" ? "校内工作人员" : "未知",
          schoolId: ic.schoolId,
          schoolName: ic.school.name,
          createdByUserId: ic.createdByUserId,
          createdByName: ic.createdBy?.nickname || "系统",
          isUsed: ic.status === "USED",
          usedByUserId: ic.usedByUserId,
          usedByName: ic.usedByUser?.nickname || null,
          usedAt: ic.usedAt?.toISOString() || null,
          expiresAt: ic.expiresAt?.toISOString() || null,
          createdAt: ic.createdAt.toISOString(),
          status: statusStr,
        };
      }),
    });
  } catch (error) {
    console.error("获取邀请码列表失败:", error);
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

