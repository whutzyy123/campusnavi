import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/market/items
 * 校级管理员获取本校生存集市商品列表
 * Query: schoolId (必填), search?, categoryId?, status?, page?, limit?
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return NextResponse.json({ success: false, message: "请先登录" }, { status: 401 });
    }
    const isAdmin = auth.role === "ADMIN" || auth.role === "STAFF" || auth.role === "SUPER_ADMIN";
    if (!isAdmin) {
      return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const search = searchParams.get("search")?.trim();
    const categoryId = searchParams.get("categoryId")?.trim();
    const status = searchParams.get("status")?.trim();
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    if (!schoolId?.trim()) {
      return NextResponse.json({ success: false, message: "schoolId 为必填项" }, { status: 400 });
    }

    if (auth.role !== "SUPER_ADMIN" && auth.schoolId !== schoolId) {
      return NextResponse.json({ success: false, message: "只能查看本校数据" }, { status: 403 });
    }

    const where: Record<string, unknown> = { schoolId: schoolId.trim() };
    if (categoryId) where.categoryId = categoryId;
    if (status && ["ACTIVE", "LOCKED", "COMPLETED", "DELETED"].includes(status)) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { user: { nickname: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.marketItem.count({ where }),
      prisma.marketItem.findMany({
        where,
        select: {
          id: true,
          title: true,
          typeId: true,
          status: true,
          reportCount: true,
          isHidden: true,
          expiresAt: true,
          createdAt: true,
          selectedBuyerId: true,
          user: { select: { id: true, nickname: true, email: true } },
          selectedBuyer: { select: { id: true, nickname: true, email: true } },
          category: { select: { id: true, name: true } },
          poi: { select: { id: true, name: true } },
          images: true,
          price: true,
          transactionType: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        typeId: item.typeId,
        transactionType: item.transactionType,
        status: item.status,
        reportCount: item.reportCount,
        isHidden: item.isHidden,
        expiresAt: item.expiresAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        user: item.user,
        buyer: item.selectedBuyer,
        buyerId: item.selectedBuyerId,
        category: item.category,
        poi: item.poi,
        images: (item.images as string[]) ?? [],
        price: item.price,
      })),
      pagination: {
        total,
        pageCount: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("获取集市商品列表失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "服务器错误" },
      { status: 500 }
    );
  }
}
