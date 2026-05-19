import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 构建带 redirect 查询参数的登录重定向
 */
export function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}
