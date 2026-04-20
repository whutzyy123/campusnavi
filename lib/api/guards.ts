import { NextResponse } from "next/server";
import { getAuthCookie, type AuthCookieData } from "@/lib/auth-server-actions";
import { jsonErr } from "@/lib/api/http";

const SCHOOL_ADMIN_ROLES = new Set(["ADMIN", "STAFF", "SUPER_ADMIN"]);

/** Route Handler 中判断守卫是否返回了错误响应 */
export function isAuthError(res: AuthCookieData | NextResponse): res is NextResponse {
  return res instanceof NextResponse;
}

/**
 * 已登录会话；未登录返回 401 JSON（供 Route Handler 使用，不 redirect）
 */
export async function requireSessionJson(): Promise<AuthCookieData | NextResponse> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return jsonErr("请先登录", 401);
  }
  return auth;
}

/**
 * 校级管理员、工作人员或超级管理员（与 requireAdmin 角色一致）；否则 401/403 JSON
 */
export async function requireSchoolAdminJson(): Promise<AuthCookieData | NextResponse> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return jsonErr("请先登录", 401);
  }
  if (!SCHOOL_ADMIN_ROLES.has(auth.role)) {
    return jsonErr("无权限", 403);
  }
  return auth;
}

/**
 * 仅超级管理员
 */
export async function requireSuperAdminJson(): Promise<AuthCookieData | NextResponse> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return jsonErr("请先登录", 401);
  }
  if (auth.role !== "SUPER_ADMIN") {
    return jsonErr("权限不足，仅限超级管理员访问", 403);
  }
  return auth;
}

/**
 * 校级管理员或超级管理员（与邀请码 API 原手写鉴权一致）；STAFF 返回 403
 */
export async function requireAdminOrSuperAdminJson(): Promise<AuthCookieData | NextResponse> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return jsonErr("请先登录", 401);
  }
  if (auth.role !== "ADMIN" && auth.role !== "SUPER_ADMIN") {
    return jsonErr("无权限", 403);
  }
  return auth;
}
