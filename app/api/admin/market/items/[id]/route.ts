import { NextRequest, NextResponse } from "next/server";
import { adminMarketItemAction } from "@/lib/market-actions";

/**
 * PATCH /api/admin/market/items/[id]
 * 管理员操作（校管/工作人员/超管）：
 * - delete: 下架（ACTIVE/LOCKED → isHidden）或彻底删除（isHidden/COMPLETED/EXPIRED/DELETED）
 * - relist: 重新上架，仅限管理员下架的商品（isHidden），禁止对 COMPLETED/DELETED/已过期 操作
 * Body: { action: "delete" | "relist" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ success: false, message: "商品 ID 必填" }, { status: 400 });
    }

    let body: { action?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "请求体格式错误" }, { status: 400 });
    }

    const action = body.action?.trim();
    if (action !== "delete" && action !== "relist") {
      return NextResponse.json(
        { success: false, message: "action 必须为 delete 或 relist" },
        { status: 400 }
      );
    }

    const result = await adminMarketItemAction(id.trim(), action);

    if (!result.success) {
      const err = result.error ?? "";
      const status = err.includes("请先登录")
        ? 401
        : err.includes("无权限") || err.includes("只能操作")
          ? 403
          : err.includes("商品不存在")
            ? 404
            : err.includes("不可") || err.includes("仅可") || err.includes("不支持")
              ? 400
              : 500;
      return NextResponse.json({ success: false, message: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      message: result.data?.message ?? (action === "delete" ? "已删除" : "已重新上架"),
    });
  } catch (error) {
    console.error("管理员操作集市商品失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "服务器错误" },
      { status: 500 }
    );
  }
}
