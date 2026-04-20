import type { NextRequest } from "next/server";

type HeaderLike = Pick<Headers, "get">;

function forwardedTrustEnabled(): boolean {
  const v = process.env.TRUST_PROXY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * 从请求头解析客户端 IP。
 * - Cloudflare / Vercel 等平台头优先（通常由边缘注入，不可由浏览器伪造）。
 * - 通用 x-forwarded-for / x-real-ip 仅在 TRUST_PROXY=1|true|yes 时信任（见 .env.example）。
 */
export function getClientIpFromHeaders(h: HeaderLike): string {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const vercelFwd = h.get("x-vercel-forwarded-for")?.trim();
  if (vercelFwd) return vercelFwd.split(",")[0]?.trim() || "unknown";

  if (forwardedTrustEnabled()) {
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || "unknown";
    const realIp = h.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  return "unknown";
}

export function getClientIpFromNextRequest(request: NextRequest): string {
  return getClientIpFromHeaders(request.headers);
}
