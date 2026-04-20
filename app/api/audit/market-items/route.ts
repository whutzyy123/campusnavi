import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit/market-items
 * 获取被举报或已隐藏的生存集市商品（管理员审核用）
 * Query: schoolId (必填), minReportCount? (默认 1)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSessionJson();
    if (isAuthError(authResult)) return authResult;
    const auth = authResult;

    if (auth.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, message: "超级管理员不参与内容审核，请使用校级管理员或工作人员账号" },
        { status: 403 }
      );
    }
    const isAdmin = auth.role === "ADMIN" || auth.role === "STAFF";
    if (!isAdmin) {
      return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const minReportCount = parseInt(searchParams.get("minReportCount") || "1", 10);

    if (!schoolId?.trim()) {
      return NextResponse.json({ success: false, message: "schoolId 为必填项" }, { status: 400 });
    }

    if (!auth.schoolId || auth.schoolId !== schoolId) {
      return NextResponse.json({ success: false, message: "只能查看本校数据" }, { status: 403 });
    }

    const items = await prisma.marketItem.findMany({
      where: {
        schoolId: schoolId.trim(),
        OR: [
          { reportCount: { gte: minReportCount } },
          { isHidden: true },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        typeId: true,
        status: true,
        reportCount: true,
        isHidden: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { id: true, nickname: true, email: true } },
        category: { select: { id: true, name: true } },
        poi: { select: { id: true, name: true } },
        images: true,
        price: true,
        transactionType: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        typeId: item.typeId,
        transactionType: item.transactionType,
        status: item.status,
        reportCount: item.reportCount,
        isHidden: item.isHidden,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        user: item.user,
        category: item.category,
        poi: item.poi,
        images: (item.images as string[]) ?? [],
        price: item.price,
      })),
    });
  } catch (error) {
    console.error("获取集市举报列表失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "服务器错误" },
      { status: 500 }
    );
  }
}
