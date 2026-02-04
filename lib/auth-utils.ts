/**
 * 认证工具函数
 * 用于密码哈希和验证
 */

/**
 * 简单的密码哈希函数（生产环境应使用 bcrypt）
 * 这里为了简化，使用简单的哈希（实际项目应使用 bcrypt）
 */
export async function hashPassword(password: string): Promise<string> {
  // 使用 Web Crypto API 进行哈希
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === hashedPassword;
}

/**
 * 生成邀请码
 */
export function generateInvitationCode(): string {
  // 生成 8 位随机字符串（大写字母 + 数字）
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字符
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

