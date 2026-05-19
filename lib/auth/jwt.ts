/**
 * JWT 工具模块
 * 用于签发和验证认证 JWT，支持 Edge Runtime
 */

import { SignJWT, jwtVerify } from "jose";
import type { AppRole } from "@/lib/auth/role";

export interface AuthJWTPayload {
  userId: string;
  role: AppRole;
  schoolId: string | null;
}

const JWT_COOKIE_NAME = "campus-auth-jwt";
const JWT_EXPIRES_IN = "7d"; // 7 天，与 Session 一致

function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * 签发认证 JWT
 */
export async function signAuthJWT(payload: AuthJWTPayload): Promise<string> {
  const secret = getJWTSecret();
  const token = await new SignJWT({
    userId: payload.userId,
    role: payload.role,
    schoolId: payload.schoolId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(secret);
  return token;
}

/**
 * 验证认证 JWT
 * @returns 验证成功返回 payload，失败返回 null
 */
export async function verifyAuthJWT(token: string): Promise<AuthJWTPayload | null> {
  try {
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret);
    
    // 类型检查
    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      (payload.schoolId !== null && typeof payload.schoolId !== "string")
    ) {
      return null;
    }
    
    // 验证 role 是否为有效的 AppRole
    const validRoles: AppRole[] = ["STUDENT", "ADMIN", "STAFF", "SUPER_ADMIN"];
    if (!validRoles.includes(payload.role as AppRole)) {
      return null;
    }
    
    return {
      userId: payload.userId,
      role: payload.role as AppRole,
      schoolId: payload.schoolId as string | null,
    };
  } catch {
    return null;
  }
}

/**
 * 获取 JWT Cookie 名称
 */
export function getJWTCookieName(): string {
  return JWT_COOKIE_NAME;
}
