import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractRoleFromJWTCookie } from "@/lib/auth/middleware-jwt";
import { redirectToLogin } from "@/lib/auth/middleware-admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPath = pathname.startsWith("/admin");
  const isSuperAdminPath = pathname.startsWith("/super-admin");
  const isSquarePostPath = pathname === "/square/post" || pathname.startsWith("/square/post/");

  if (isSquarePostPath) {
    try {
      const role = await extractRoleFromJWTCookie(request);
      if (!role) {
        return redirectToLogin(request, pathname);
      }
    } catch {
      return redirectToLogin(request, pathname);
    }
  }

  if (isAdminPath || isSuperAdminPath) {
    try {
      // 从 JWT Cookie 中提取角色（无 HTTP 调用）
      const role = await extractRoleFromJWTCookie(request);

      if (!role) {
        return redirectToLogin(request, pathname);
      }

      if (isSuperAdminPath) {
        if (role !== "SUPER_ADMIN") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          return NextResponse.redirect(url);
        }
      } else {
        if (role !== "ADMIN" && role !== "STAFF" && role !== "SUPER_ADMIN") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          return NextResponse.redirect(url);
        }
      }
    } catch {
      return redirectToLogin(request, pathname);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/super-admin/:path*", "/square/post"],
};
