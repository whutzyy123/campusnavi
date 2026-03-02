import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 权限路由拦截中间件
 * 只读取 HTTP Only Cookie，验证 ADMIN/STAFF/SUPER_ADMIN 权限
 * 仅匹配 /admin/*，token 缺失时直接重定向到 /login，与 logoutUser Server Action 的 redirect 一致。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查是否是管理员路径
  if (pathname.startsWith("/admin")) {
    // 从 HTTP Only Cookie 中获取认证信息
    const authCookie = request.cookies.get("campus-survival-auth-token");
    
    if (!authCookie) {
      // 未登录，重定向到登录页
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    try {
      // 解析 Cookie 数据
      const authData = JSON.parse(decodeURIComponent(authCookie.value));
      const userRole = authData?.role;

      // 只有 ADMIN、STAFF 或 SUPER_ADMIN 角色才能访问
      if (userRole !== "ADMIN" && userRole !== "STAFF" && userRole !== "SUPER_ADMIN") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
    } catch (error) {
      // Cookie 解析失败，重定向到登录页
      console.error("解析认证 Cookie 失败:", error);
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};

