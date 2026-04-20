import { NextRequest, NextResponse } from "next/server";
import { reportPOI } from "@/lib/poi-actions";

export const dynamic = "force-dynamic";

/**
 * POST /api/audit/report
 * 用户举报 POI（与 Server Action reportPOI 同逻辑：须登录 + 限流）
 *
 * 请求体：
 * {
 *   poiId: string,
 *   reason: string, // "定位不准" | "信息错误" | "有害内容"
 *   description?: string // 可选描述
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { poiId, reason, description } = body;

    if (!poiId || !reason) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：poiId, reason" },
        { status: 400 }
      );
    }

    const result = await reportPOI(
      typeof poiId === "string" ? poiId : String(poiId),
      reason,
      description ?? undefined
    );

    if (!result.success) {
      const msg = result.error ?? "举报失败";
      if (msg === "请先登录") {
        return NextResponse.json({ success: false, message: msg }, { status: 401 });
      }
      if (msg.includes("过于频繁") || msg.includes("次数已达上限")) {
        return NextResponse.json({ success: false, message: msg }, { status: 429 });
      }
      if (msg === "POI 不存在") {
        return NextResponse.json({ success: false, message: msg }, { status: 404 });
      }
      return NextResponse.json({ success: false, message: msg }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "举报成功，感谢您的反馈",
      poi: {
        id: typeof poiId === "string" ? poiId : String(poiId),
        reportCount: result.data!.reportCount,
        isHidden: result.data!.isHidden,
      },
    });
  } catch (error) {
    console.error("举报失败:", error);
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
