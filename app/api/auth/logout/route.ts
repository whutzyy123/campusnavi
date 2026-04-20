import { NextResponse } from "next/server";
import { removeAuthCookie } from "@/lib/auth-server-actions";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout
 * 清除会话 Cookie（供客户端在 Server Action 登出失败时兜底调用）
 */
export async function POST() {
  await removeAuthCookie();
  return NextResponse.json({ success: true });
}
