import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 供中间件内部 fetch 使用：request.url 在部分 Serverless/反代场景下 host 不可靠，
 * 可配置 INTERNAL_APP_BASE_URL 或 NEXT_PUBLIC_APP_URL；Vercel 上可用 VERCEL_URL。
 */
function resolveInternalOrigin(request: NextRequest): string {
  const explicit =
    process.env.INTERNAL_APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http")
      ? vercel.replace(/\/$/, "")
      : `https://${vercel.replace(/\/$/, "")}`;
  }
  return request.nextUrl.origin;
}

/** 构建带 redirect 查询参数的登录重定向 */
export function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

/** 从 /api/auth/me 拉取当前用户角色（与 getMe 对外字段一致） */
export async function fetchAuthMeRole(request: NextRequest): Promise<string | undefined> {
  const meUrl = new URL("/api/auth/me", `${resolveInternalOrigin(request)}/`);
  const res = await fetch(meUrl, {
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { success?: boolean; user?: { role?: string } };
  if (data.success !== true || typeof data.user?.role !== "string" || !data.user.role) {
    return undefined;
  }
  return data.user.role;
}
