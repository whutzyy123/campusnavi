import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchAuthMeRole, redirectToLogin } from "@/lib/middleware-admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPath = pathname.startsWith("/admin");
  const isSuperAdminPath = pathname.startsWith("/super-admin");

  if (isAdminPath || isSuperAdminPath) {
    const sessionCookie = request.cookies.get("campus-survival-session");

    if (!sessionCookie?.value) {
      return redirectToLogin(request, pathname);
    }

    try {
      const role = await fetchAuthMeRole(request);

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
  matcher: ["/admin/:path*", "/super-admin/:path*"],
};
