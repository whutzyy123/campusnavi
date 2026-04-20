import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Seed 路由鉴权：
 * - 配置了 SEED_SECRET 时：必须 Authorization: Bearer <SEED_SECRET>
 * - 未配置时：仅 development 允许匿名；其余环境返回 401
 */
export function requireSeedBearerIfConfigured(request: NextRequest): NextResponse | null {
  const secret = process.env.SEED_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    return null;
  }
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, message: "SEED_SECRET is required outside development" },
      { status: 401 }
    );
  }
  return null;
}
