"use server";

import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import { createNotification } from "@/lib/actions/notification";
import { MarketLogActionType, Prisma } from "@prisma/client";

// 注意：以下类型/常量在各自文件中定义，此处只 re-export async 函数
// - NotificationType, NotificationEntityType → @prisma/client（是枚举对象，非 async）
// - MarketLogActionType, MARKET_LOG_ACTION_LABELS → ./constants.ts（是常量对象，非 async）
// - deniedBySchoolTenant → @/lib/school/scope（是同步函数）
// 如需使用这些，请直接从对应模块导入，不要从 shared.ts 导入
export { createNotification };

/** 创建集市商品审计日志（在事务内调用时传入 tx 以保持一致性） */
export async function createMarketLog(
  itemId: string,
  userId: string,
  actionType: MarketLogActionType,
  details?: string | null,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  await client.marketLog.create({
    data: { itemId, userId, actionType, details: details ?? null },
  });
}

/** 获取系统用户 ID（用于自动操作的审计日志）；优先 SYSTEM_AUDIT_USER_ID，否则取 id 最小的超管 */
/** 模块级缓存：避免每次调用都查询数据库 */
let _cachedSystemUserId: string | null | "pending" = "pending";

export async function getSystemUserId(): Promise<string | null> {
  if (_cachedSystemUserId !== "pending") return _cachedSystemUserId;

  const configured = process.env.SYSTEM_AUDIT_USER_ID?.trim();
  if (configured) {
    const u = await prisma.user.findUnique({
      where: { id: configured },
      select: { id: true, role: true },
    });
    if (u?.role === 4) {
      _cachedSystemUserId = u.id;
      return _cachedSystemUserId;
    }
  }
  const user = await prisma.user.findFirst({
    where: { role: 4 },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  _cachedSystemUserId = user?.id ?? null;
  return _cachedSystemUserId;
}

/** 校验管理员/工作人员权限（校管/工作人员/超管） */
export async function requireAdminOrStaff(): Promise<
  | { ok: true; auth: { userId: string; role?: string; schoolId?: string | null } }
  | { ok: false; error: string }
> {
  const auth = await getAuthCookie();
  if (!auth?.userId) return { ok: false, error: "请先登录" };
  const isAdmin =
    auth.role === "ADMIN" || auth.role === "STAFF" || auth.role === "SUPER_ADMIN";
  if (!isAdmin) return { ok: false, error: "无权限" };
  return { ok: true, auth };
}
