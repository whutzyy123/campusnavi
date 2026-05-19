/**
 * Middleware JWT 验证函数
 * 供 middleware.ts 使用，从 Cookie 中提取用户角色
 * 支持 Edge Runtime
 */

import type { NextRequest } from "next/server";
import { verifyAuthJWT, getJWTCookieName } from "@/lib/auth/jwt";
import type { AppRole } from "@/lib/auth/role";

/**
 * 从 JWT Cookie 中提取用户角色
 * @param request NextRequest 对象
 * @returns 验证成功返回角色，失败返回 null
 */
export async function extractRoleFromJWTCookie(
  request: NextRequest
): Promise<AppRole | null> {
  const cookieName = getJWTCookieName();
  const jwtCookie = request.cookies.get(cookieName);

  if (!jwtCookie?.value) {
    return null;
  }

  const payload = await verifyAuthJWT(jwtCookie.value);
  if (!payload) {
    return null;
  }

  return payload.role;
}

/**
 * 从 JWT Cookie 中提取完整 payload
 * @param request NextRequest 对象
 * @returns 验证成功返回 payload，失败返回 null
 */
export async function extractPayloadFromJWTCookie(
  request: NextRequest
): Promise<{ userId: string; role: AppRole; schoolId: string | null } | null> {
  const cookieName = getJWTCookieName();
  const jwtCookie = request.cookies.get(cookieName);

  if (!jwtCookie?.value) {
    return null;
  }

  return await verifyAuthJWT(jwtCookie.value);
}
