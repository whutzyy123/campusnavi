import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";
import { createNotification } from "@/lib/notification-actions";
import { NotificationType, NotificationEntityType } from "@prisma/client";

/**
 * POST /api/audit/market-resolve
 * 管理员处理生存集市举报
 * body: { itemId: string, action: "pass" | "delete" }
 * pass: 重置 reportCount，取消隐藏
 * delete: 删除商品
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return NextResponse.json({ success: false, message: "请先登录" }, { status: 401 });
    }
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

    const body = await request.json();
    const { itemId, action } = body as { itemId?: string; action?: string };

    if (!itemId?.trim() || !action) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：itemId, action" },
        { status: 400 }
      );
    }

    if (!["pass", "delete"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "action 必须是 pass 或 delete" },
        { status: 400 }
      );
    }

    const item = await prisma.marketItem.findUnique({
      where: { id: itemId.trim() },
      select: { id: true, schoolId: true, userId: true, title: true },
    });

    if (!item) {
      return NextResponse.json({ success: false, message: "商品不存在" }, { status: 404 });
    }

    if (!auth.schoolId || auth.schoolId !== item.schoolId) {
      return NextResponse.json({ success: false, message: "只能处理本校商品" }, { status: 403 });
    }

    if (action === "pass") {
      await prisma.marketItem.update({
        where: { id: item.id },
        data: { reportCount: 0, isHidden: false },
      });
      return NextResponse.json({
        success: true,
        message: "已通过审核，商品已恢复显示",
      });
    }

    if (action === "delete") {
      await prisma.marketItem.delete({
        where: { id: item.id },
      });
      if (item.userId) {
        await createNotification(
          item.userId,
          null,
          NotificationType.SYSTEM,
          item.id,
          NotificationEntityType.MARKET_ITEM,
          `您的生存集市商品「${(item.title || "").slice(0, 30)}」已被管理员删除。如有疑问请联系管理员。`
        );
      }
      return NextResponse.json({
        success: true,
        message: "商品已删除",
      });
    }

    return NextResponse.json({ success: false, message: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("处理集市举报失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "服务器错误" },
      { status: 500 }
    );
  }
}
