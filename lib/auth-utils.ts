/**
 * 认证工具函数
 * 用于密码哈希和验证
 */

import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

function isLegacySha256Hash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function legacySha256DigestEquals(storedHex: string, computedHex: string): boolean {
  try {
    const a = Buffer.from(storedHex, "hex");
    const b = Buffer.from(computedHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * 密码哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
   if (isLegacySha256Hash(hashedPassword)) {
    const computed = await sha256Hex(password);
    return legacySha256DigestEquals(hashedPassword, computed);
  }

  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(hashedPassword: string): boolean {
  return isLegacySha256Hash(hashedPassword);
}

/**
 * 生成邀请码
 */
export function generateInvitationCode(): string {
  // 生成 8 位随机字符串（大写字母 + 数字）
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字符
  const n = chars.length;
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[buf[i]! % n];
  }
  return code;
}
