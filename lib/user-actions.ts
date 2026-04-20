"use server";

/**
 * 用户相关 Server Actions
 * 处理用户自助操作（如注销账号）、公开资料查询、超级管理员用户详情
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { removeAuthCookie } from "@/lib/auth-server-actions";
import { hashPassword } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getPaginationParams, getPaginationMeta } from "@/lib/utils";
import { getUserReputation as getUserReputationFromMarket } from "@/lib/market-actions";
import { appRoleToDbRole, dbRoleToAppRole, type AppRole } from "@/lib/role";

/** 角色数字到可读标签映射 */
const ROLE_LABELS: Record<number, string> = {
  0: "游客",
  1: "学生",
  2: "校级管理员",
  3: "工作人员",
  4: "超级管理员",
};

/**
 * 校验当前用户是否为超级管理员
 */
async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });

  if (!user) {
    return { ok: false, error: "用户不存在" };
  }

  if (user.role !== appRoleToDbRole("SUPER_ADMIN")) {
    return { ok: false, error: "权限不足，仅超级管理员可执行此操作" };
  }

  return { ok: true, userId: auth.userId };
}

/** 管理员或超级管理员权限：SUPER_ADMIN 或 ADMIN（需绑定学校） */
interface AdminAuth {
  userId: string;
  role: string;
  schoolId: string | null;
}

async function requireAdminOrSuperAdmin(): Promise<{ ok: true; auth: AdminAuth } | { ok: false; error: string }> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true, schoolId: true },
  });

  if (!user) {
    return { ok: false, error: "用户不存在" };
  }

  const isSuperAdmin = user.role === appRoleToDbRole("SUPER_ADMIN");
  const isAdmin = user.role === appRoleToDbRole("ADMIN");

  if (!isSuperAdmin && !isAdmin) {
    return { ok: false, error: "权限不足，仅管理员可执行此操作" };
  }

  if (isAdmin && !user.schoolId) {
    return { ok: false, error: "当前管理员未绑定学校" };
  }

  return {
    ok: true,
    auth: {
      userId: auth.userId,
      role: isSuperAdmin ? "SUPER_ADMIN" : "ADMIN",
      schoolId: user.schoolId,
    },
  };
}

/** 校验当前用户是否有权操作目标用户：SUPER_ADMIN 任意；ADMIN 仅同校 */
function canAccessTargetUser(auth: AdminAuth, targetSchoolId: string | null): boolean {
  if (auth.role === "SUPER_ADMIN") return true;
  if (auth.role === "ADMIN" && auth.schoolId) {
    return targetSchoolId === auth.schoolId;
  }
  return false;
}

const SCHOOL_USER_FILTER_ROLES: readonly AppRole[] = ["STUDENT", "ADMIN", "STAFF"];

export interface GetSchoolUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: "STUDENT" | "ADMIN" | "STAFF";
}

export interface SchoolUserListItem {
  id: string;
  nickname: string | null;
  email: string | null;
  role: string;
  roleNumber: number;
  schoolId: string | null;
  schoolName: string;
  schoolCode: string | null;
  createdAt: string;
  status: string;
}

/**
 * 获取本校用户列表（校级管理员专用）
 * 约束：仅返回 schoolId === 当前管理员学校 的用户，排除超级管理员
 */
export async function getSchoolUsers(
  params: GetSchoolUsersParams = {}
): Promise<{
  success: boolean;
  data?: SchoolUserListItem[];
  pagination?: { total: number; pageCount: number; currentPage: number; limit: number };
  error?: string;
}> {
  try {
    const authResult = await requireAdminOrSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    const { auth } = authResult;

    // getSchoolUsers 仅限校级管理员，且必须绑定学校
    if (auth.role !== "ADMIN" || !auth.schoolId) {
      return { success: false, error: "仅校级管理员可查看本校用户列表" };
    }
    const schoolIdFilter = auth.schoolId;

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));
    const { skip, take } = getPaginationParams(page, limit);

    const roleFilter =
      params.role && (SCHOOL_USER_FILTER_ROLES as readonly string[]).includes(params.role)
        ? appRoleToDbRole(params.role as AppRole)
        : { not: appRoleToDbRole("SUPER_ADMIN") };

    const where: Record<string, unknown> = {
      schoolId: schoolIdFilter!,
      role: roleFilter,
    };

    if (params.search?.trim()) {
      where.nickname = { contains: params.search.trim() };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          nickname: true,
          email: true,
          role: true,
          schoolId: true,
          createdAt: true,
          status: true,
          school: { select: { name: true, schoolCode: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    const data: SchoolUserListItem[] = users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      email: u.email,
      role: dbRoleToAppRole(u.role) ?? "UNKNOWN",
      roleNumber: u.role,
      schoolId: u.schoolId,
      schoolName: u.school?.name ?? "—",
      schoolCode: u.school?.schoolCode ?? null,
      createdAt: u.createdAt.toISOString(),
      status: u.status ?? "ACTIVE",
    }));

    const pagination = getPaginationMeta(total, page, limit);

    return { success: true, data, pagination };
  } catch (err) {
    console.error("[getSchoolUsers]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取失败",
    };
  }
}

/** 超级管理员用户详情（只读） */
export interface AdminUserDetail {
  basic: {
    nickname: string | null;
    email: string | null;
    role: string;
    schoolName: string | null;
    avatarUrl: string | null;
  };
  meta: {
    registrationDate: string;
    lastLogin: string | null;
  };
  stats: {
    poiCommentCount: number;
    marketItemCount: number;
    lostFoundCount: number;
  };
  security: {
    invitationCode: string | null;
    accountStatus: string;
  };
}

/**
 * 获取用户详情（超级管理员或本校校级管理员可访问）
 * 返回基本信息、元数据、统计、安全相关数据
 */
export async function getAdminUserDetail(
  userId: string
): Promise<{ success: boolean; data?: AdminUserDetail; error?: string }> {
  try {
    const authResult = await requireAdminOrSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    if (!userId?.trim()) {
      return { success: false, error: "用户 ID 不能为空" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId.trim() },
      select: {
        nickname: true,
        email: true,
        role: true,
        status: true,
        avatar: true,
        schoolId: true,
        createdAt: true,
        school: { select: { name: true } },
        usedInvitationCode: { select: { code: true } },
        _count: {
          select: {
            comments: true,
            marketItems: true,
            lostFoundEvents: true,
          },
        },
      },
    });

    if (!user) {
      return { success: false, error: "用户不存在" };
    }

    if (!canAccessTargetUser(authResult.auth, user.schoolId)) {
      return { success: false, error: "无权查看该用户资料" };
    }

    return {
      success: true,
      data: {
        basic: {
          nickname: user.nickname,
          email: user.email,
          role: ROLE_LABELS[user.role] ?? `未知(${user.role})`,
          schoolName: user.school?.name ?? null,
          avatarUrl: user.avatar ?? null,
        },
        meta: {
          registrationDate: user.createdAt.toISOString(),
          lastLogin: null, // 暂无 lastLogin 字段
        },
        stats: {
          poiCommentCount: user._count.comments,
          marketItemCount: user._count.marketItems,
          lostFoundCount: user._count.lostFoundEvents,
        },
        security: {
          invitationCode: user.usedInvitationCode?.code ?? null,
          accountStatus: user.status,
        },
      },
    };
  } catch (err) {
    console.error("[getAdminUserDetail]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取失败",
    };
  }
}

const MIN_PASSWORD_LENGTH = 6;

/**
 * 管理员重置用户密码（超级管理员或本校校级管理员可执行）
 * 禁止重置自己的密码（应使用个人设置）
 */
export async function adminResetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  try {
    const authResult = await requireAdminOrSuperAdmin();
    if (!authResult.ok) {
      return { success: false, message: authResult.error };
    }

    if (!userId?.trim()) {
      return { success: false, message: "用户 ID 不能为空" };
    }

    // 禁止通过此接口重置自己的密码，避免误操作导致锁死
    if (userId.trim() === authResult.auth.userId) {
      return {
        success: false,
        message: "不能通过此功能重置自己的密码，请使用个人设置修改",
      };
    }

    if (!newPassword || typeof newPassword !== "string") {
      return { success: false, message: "新密码不能为空" };
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        message: `密码长度至少为 ${MIN_PASSWORD_LENGTH} 个字符`,
      };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId.trim() },
      select: { id: true, schoolId: true },
    });

    if (!targetUser) {
      return { success: false, message: "用户不存在" };
    }

    if (!canAccessTargetUser(authResult.auth, targetUser.schoolId)) {
      return { success: false, message: "无权重置该用户的密码" };
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId.trim() },
      data: { password: hashedPassword },
    });

    return { success: true, message: "密码已重置" };
  } catch (err) {
    console.error("[adminResetUserPassword]", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "重置失败，请重试",
    };
  }
}

/** 超级管理员用户列表项 */
export interface AdminUserListItem {
  id: string;
  nickname: string | null;
  email: string | null;
  role: string;
  roleNumber: number;
  schoolId: string | null;
  schoolName: string;
  schoolCode: string | null;
  createdAt: string;
  status: string;
}

/**
 * 获取所有用户数据（仅超级管理员）
 */
export async function getAdminUsers(params: {
  page?: number;
  limit?: number;
  role?: string;
  schoolId?: string;
  search?: string;
  field?: "email" | "nickname";
}): Promise<{
  success: boolean;
  data?: AdminUserListItem[];
  pagination?: { total: number; pageCount: number; currentPage: number };
  error?: string;
}> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    const whereConditions: Array<Record<string, unknown>> = [];
    const adminListRoles: readonly AppRole[] = ["STUDENT", "ADMIN", "STAFF", "SUPER_ADMIN"];
    if (params.role && (adminListRoles as readonly string[]).includes(params.role)) {
      whereConditions.push({ role: appRoleToDbRole(params.role as AppRole) });
    }
    if (params.schoolId !== undefined) {
      if (params.schoolId === "null") {
        whereConditions.push({ schoolId: null });
      } else {
        whereConditions.push({ schoolId: params.schoolId });
      }
    }
    const searchField = params.field === "email" ? "email" : "nickname";
    if (params.search?.trim()) {
      whereConditions.push({
        [searchField]: { contains: params.search.trim() },
      });
    }
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));
    const { skip, take } = getPaginationParams(page, limit);

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          nickname: true,
          email: true,
          role: true,
          schoolId: true,
          createdAt: true,
          status: true,
          school: { select: { id: true, name: true, schoolCode: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    const data: AdminUserListItem[] = users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      email: u.email,
      role: dbRoleToAppRole(u.role) ?? "UNKNOWN",
      roleNumber: u.role,
      schoolId: u.schoolId,
      schoolName: u.school?.name ?? "系统",
      schoolCode: u.school?.schoolCode ?? null,
      createdAt: u.createdAt.toISOString(),
      status: u.status ?? "ACTIVE",
    }));

    const pagination = getPaginationMeta(total, page, limit);
    return { success: true, data, pagination };
  } catch (err) {
    console.error("[getAdminUsers]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取用户列表失败",
    };
  }
}

/**
 * 永久删除用户（仅超级管理员）
 * 禁止删除自己；禁止删除其他超级管理员
 */
export async function deleteUser(userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const authResult = await requireSuperAdmin();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    if (!userId?.trim()) {
      return { success: false, error: "用户 ID 不能为空" };
    }

    if (userId.trim() === authResult.userId) {
      return { success: false, error: "不能删除自己的账户" };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId.trim() },
      select: { id: true, role: true, nickname: true },
    });

    if (!targetUser) {
      return { success: false, error: "用户不存在" };
    }

    if (targetUser.role === appRoleToDbRole("SUPER_ADMIN")) {
      return { success: false, error: "不能删除其他超级管理员" };
    }

    await prisma.user.delete({ where: { id: userId.trim() } });

    return {
      success: true,
      message: `用户 "${targetUser.nickname || userId}" 已永久删除`,
    };
  } catch (err) {
    console.error("[deleteUser]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

/**
 * 停用/激活用户（超级管理员或本校校级管理员可执行）
 * 禁止停用自己；禁止停用其他超级管理员
 */
export async function deactivateUser(
  userId: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<{ success: boolean; message: string }> {
  try {
    const authResult = await requireAdminOrSuperAdmin();
    if (!authResult.ok) {
      return { success: false, message: authResult.error };
    }

    if (!userId?.trim()) {
      return { success: false, message: "用户 ID 不能为空" };
    }

    if (status !== "ACTIVE" && status !== "INACTIVE") {
      return { success: false, message: "status 必须为 ACTIVE 或 INACTIVE" };
    }

    // 禁止停用自己
    if (userId.trim() === authResult.auth.userId) {
      return { success: false, message: "不能停用自己的账户" };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId.trim() },
      select: { id: true, role: true, schoolId: true },
    });

    if (!targetUser) {
      return { success: false, message: "用户不存在" };
    }

    if (targetUser.role === appRoleToDbRole("SUPER_ADMIN")) {
      return { success: false, message: "不能停用其他超级管理员" };
    }

    if (!canAccessTargetUser(authResult.auth, targetUser.schoolId)) {
      return { success: false, message: "无权操作该用户" };
    }

    await prisma.user.update({
      where: { id: userId.trim() },
      data: { status },
    });

    return {
      success: true,
      message: status === "ACTIVE" ? "已激活" : "已停用",
    };
  } catch (err) {
    console.error("[deactivateUser]", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "操作失败，请重试",
    };
  }
}

/** 公开资料（仅返回可展示字段，不含敏感信息） */
export interface PublicProfile {
  nickname: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** 集市交易好评率 0-100（有评价时才有） */
  marketThumbsUpRate?: number | null;
}

/**
 * 获取用户公开资料
 * 仅返回 nickname、avatar、bio、marketThumbsUpRate，不返回 email、role 等敏感信息
 */
export async function getPublicProfile(
  userId: string
): Promise<{ success: boolean; data?: PublicProfile; error?: string }> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "用户 ID 不能为空" };
    }

    const { getMarketThumbsUpRate } = await import("@/lib/market-actions");

    const [user, thumbsUpResult] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId.trim() },
        select: { nickname: true, avatar: true, bio: true },
      }),
      getMarketThumbsUpRate(userId.trim()),
    ]);

    if (!user) {
      return { success: false, error: "用户不存在" };
    }

    return {
      success: true,
      data: {
        nickname: user.nickname,
        avatarUrl: user.avatar,
        bio: user.bio,
        marketThumbsUpRate:
          thumbsUpResult.success && thumbsUpResult.data && thumbsUpResult.data.total > 0
            ? thumbsUpResult.data.rate
            : null,
      },
    };
  } catch (err) {
    console.error("[getPublicProfile]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取失败",
    };
  }
}

/**
 * 注销账号（自助删除）
 * 永久删除当前用户及其关联数据，清除认证 Cookie
 */
export async function deleteMyAccount(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return {
        success: false,
        message: "请先登录",
      };
    }

    await prisma.user.delete({
      where: { id: auth.userId },
    });

    await removeAuthCookie();

    return {
      success: true,
      message: "账号已注销",
    };
  } catch (error) {
    console.error("注销账号失败:", error);
    return {
      success: false,
      message: "注销失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 获取用户集市声誉（委托至 market-actions）
 * @param targetUserId 目标用户 ID
 * @param mode 角色：seller=卖家声誉（买家评价），buyer=买家声誉（卖家评价）
 */
export async function getUserReputation(
  targetUserId: string,
  mode: "seller" | "buyer"
) {
  return getUserReputationFromMarket(targetUserId, mode);
}
