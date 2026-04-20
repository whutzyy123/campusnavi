import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPaginationParams } from "@/lib/utils";

/**
 * Route Handler 统一错误响应（JSON，不 redirect）
 */
export function jsonErr(message: string, status: number, error?: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      message,
      ...(error !== undefined ? { error } : {}),
    },
    { status }
  );
}

/**
 * Route Handler 成功响应：合并到 { success: true, ...payload }
 * 推荐新接口使用 payload `{ data: T, message?, pagination? }`；历史接口可继续传顶层键（如 `schools`）。
 */
export function jsonOk(payload: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, ...payload }, init);
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * 从请求解析分页参数（与 {@link getPaginationParams} 一致，`limit` 为每页条数上限已裁剪后的值）
 */
export function getPaginationFromRequest(request: NextRequest): {
  page: number;
  limit: number;
  skip: number;
  take: number;
} {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10);
  const limitRaw = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const { skip, take } = getPaginationParams(page, limitRaw);
  return {
    page,
    limit: take,
    skip,
    take,
  };
}
