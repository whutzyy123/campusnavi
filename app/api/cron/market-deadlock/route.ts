import { NextRequest, NextResponse } from "next/server";
import { processMarketDeadlocks } from "@/lib/market-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/market-deadlock
 * 集市死锁保护定时任务：自动解锁、单方自动完成
 * 由 Vercel Cron 定期调用，或手动触发
 * 需配置 CRON_SECRET 环境变量以验证请求来源
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    await processMarketDeadlocks();

    return NextResponse.json({ success: true, message: "Market deadlock check completed" });
  } catch (err) {
    console.error("[cron/market-deadlock]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
