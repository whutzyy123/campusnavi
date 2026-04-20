"use server";

/**
 * 邀请码 Server Actions
 * 处理邀请码的创建、校验、状态切换、删除
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { generateInvitationCode } from "@/lib/auth-utils";
import { appRoleToDbRole } from "@/lib/role";
import type { InvitationCodeType, InvitationCodeStatus } from "@prisma/client";

export type InvitationCodeTypeStr = "ADMIN" | "STAFF";
export type InvitationCodeStatusStr = "ACTIVE" | "USED" | "DISABLED" | "DEACTIVATED";

export interface InvitationCodeListItem {
  id: string;
  code: string;
  type: "ADMIN" | "STAFF";
  schoolId: string;
  schoolName: string;
  status: "ACTIVE" | "USED" | "DISABLED" | "DEACTIVATED";
  createdByName: string;
  usedByUserId: string | null;
  usedByEmail: string | null;
  usedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

/**
 * 获取邀请码列表
 * 超级管理员：全部；校级管理员：仅本校
 */
export async function listInvitationCodes(filters?: {
  schoolId?: string;
  type?: InvitationCodeTypeStr;
  status?: InvitationCodeStatusStr;
}): Promise<{ success: boolean; data?: InvitationCodeListItem[]; message?: string; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, message: "请先登录" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, schoolId: true },
    });

    if (!currentUser) {
      return { success: false, message: "用户不存在" };
    }

    const isSuperAdmin = currentUser.role === appRoleToDbRole("SUPER_ADMIN");
    const isSchoolAdmin = currentUser.role === appRoleToDbRole("ADMIN");

    if (!isSuperAdmin && !isSchoolAdmin) {
      return { success: false, message: "权限不足" };
    }

    // 校级管理员必须绑定学校，且只能查看本校邀请码
    if (isSchoolAdmin && !currentUser.schoolId) {
      return { success: false, message: "当前管理员未绑定学校" };
    }

    const where: { schoolId?: string; type?: InvitationCodeType; status?: InvitationCodeStatus } = {};

    if (isSuperAdmin) {
      // 超级管理员：可选按 schoolId、type、status 过滤
      if (filters?.schoolId) where.schoolId = filters.schoolId;
    } else {
      // 校级管理员：强制仅本校，忽略传入的 filters.schoolId
      where.schoolId = currentUser.schoolId!;
    }
    if (filters?.type) {
      where.type = filters.type as InvitationCodeType;
    }
    if (filters?.status) {
      where.status = filters.status as InvitationCodeStatus;
    }

    const codes = await prisma.invitationCode.findMany({
      where,
      include: {
        school: { select: { name: true } },
        createdBy: { select: { nickname: true } },
        usedByUser: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: InvitationCodeListItem[] = codes.map((ic) => ({
      id: ic.id,
      code: ic.code,
      type: ic.type as "ADMIN" | "STAFF",
      schoolId: ic.schoolId,
      schoolName: ic.school.name,
      status: ic.status as "ACTIVE" | "USED" | "DISABLED" | "DEACTIVATED",
      createdByName: ic.createdBy?.nickname || "系统",
      usedByUserId: ic.usedByUserId ?? null,
      usedByEmail: ic.usedByUser?.email || null,
      usedAt: ic.usedAt?.toISOString() || null,
      createdAt: ic.createdAt.toISOString(),
      expiresAt: ic.expiresAt?.toISOString() || null,
    }));

    return { success: true, data };
  } catch (error) {
    console.error("获取邀请码列表失败:", error);
    return {
      success: false,
      message: "获取失败",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 创建邀请码
 * 权限：超级管理员可创建 ADMIN/STAFF；校级管理员仅可为本校创建 STAFF
 * @param durationDays 有效期天数，默认 7 天
 */
export async function createInvitationCode(
  schoolId: string,
  type: InvitationCodeTypeStr,
  durationDays: number = 7
): Promise<{
  success: boolean;
  message?: string;
  data?: { id: string; code: string; type: string; schoolId: string; schoolName: string };
  error?: string;
}> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, message: "请先登录" };
    }

    if (!["ADMIN", "STAFF"].includes(type)) {
      return { success: false, message: "无效的邀请码类型，必须是 ADMIN 或 STAFF" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, role: true, schoolId: true },
    });

    if (!currentUser) {
      return { success: false, message: "用户不存在" };
    }

    const isSuperAdmin = currentUser.role === appRoleToDbRole("SUPER_ADMIN");
    const isSchoolAdmin = currentUser.role === appRoleToDbRole("ADMIN");

    if (!isSuperAdmin && !isSchoolAdmin) {
      return { success: false, message: "权限不足，只有管理员才能生成邀请码" };
    }

    // 校级管理员只能创建 STAFF 类型，且 targetSchoolId 强制为本校
    if (isSchoolAdmin) {
      if (type === "ADMIN") {
        return { success: false, message: "校级管理员只能创建 STAFF 类型邀请码" };
      }
      if (!currentUser.schoolId) {
        return { success: false, message: "当前管理员未绑定学校" };
      }
      // 强制使用本校 ID，忽略传入的 schoolId，防止越权
      schoolId = currentUser.schoolId;
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });

    if (!school) {
      return { success: false, message: "学校不存在" };
    }

    // 生成唯一邀请码
    let code: string;
    let attempts = 0;
    do {
      code = generateInvitationCode();
      const existing = await prisma.invitationCode.findUnique({
        where: { code },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        return { success: false, message: "生成邀请码失败，请重试" };
      }
    } while (true);

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(durationDays, 365)));

    const invitationCode = await prisma.invitationCode.create({
      data: {
        code,
        type: type as InvitationCodeType,
        schoolId,
        status: "ACTIVE",
        createdByUserId: auth.userId,
        expiresAt,
      },
    });

    return {
      success: true,
      message: "邀请码生成成功",
      data: {
        id: invitationCode.id,
        code: invitationCode.code,
        type: invitationCode.type,
        schoolId: invitationCode.schoolId,
        schoolName: school.name,
      },
    };
  } catch (error) {
    console.error("创建邀请码失败:", error);
    return {
      success: false,
      message: "创建失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 批量创建邀请码
 * 权限同 createInvitationCode
 * @param durationDays 有效期天数，默认 7 天
 */
export async function createInvitationCodes(
  schoolId: string,
  type: InvitationCodeTypeStr,
  quantity: number = 1,
  durationDays: number = 7
): Promise<{
  success: boolean;
  message?: string;
  data?: { codes: string[]; schoolName: string };
  error?: string;
}> {
  const codes: string[] = [];
  let schoolName = "";

  for (let i = 0; i < Math.min(Math.max(1, quantity), 10); i++) {
    const result = await createInvitationCode(schoolId, type, durationDays);
    if (!result.success) {
      return {
        success: false,
        message: result.message || "生成失败",
        error: result.error,
      };
    }
    if (result.data) {
      codes.push(result.data.code);
      schoolName = result.data.schoolName;
    }
  }

  return {
    success: true,
    message: `已成功生成 ${codes.length} 个邀请码`,
    data: { codes, schoolName },
  };
}

/**
 * 校验邀请码
 * 仅当 status=ACTIVE 时有效
 */
export async function validateInvitationCode(
  code: string
): Promise<
  | { valid: true; schoolName: string; roleType: "ADMIN" | "STAFF"; schoolId: string }
  | { valid: false; message: string }
> {
  try {
    const trimmedCode = code?.trim().toUpperCase();
    if (!trimmedCode) {
      return { valid: false, message: "邀请码不能为空" };
    }

    const invitationCode = await prisma.invitationCode.findUnique({
      where: { code: trimmedCode },
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    if (!invitationCode) {
      return { valid: false, message: "邀请码无效" };
    }

    if (invitationCode.status !== "ACTIVE") {
      if (invitationCode.status === "USED") {
        return { valid: false, message: "邀请码已被使用" };
      }
      if (invitationCode.status === "DISABLED") {
        return { valid: false, message: "邀请码已被撤销" };
      }
      return { valid: false, message: "邀请码无效" };
    }

    if (invitationCode.expiresAt && new Date(invitationCode.expiresAt) < new Date()) {
      return { valid: false, message: "This invitation code has expired." };
    }

    return {
      valid: true,
      schoolName: invitationCode.school.name,
      roleType: invitationCode.type as "ADMIN" | "STAFF",
      schoolId: invitationCode.schoolId,
    };
  } catch (error) {
    console.error("校验邀请码失败:", error);
    return { valid: false, message: "校验失败，请重试" };
  }
}

/**
 * 消耗邀请码（注册时调用）
 * 将 status 设为 USED，写入 usedByUserId 和 usedAt
 */
export async function consumeInvitationCode(
  code: string,
  usedByUserId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const trimmedCode = code?.trim().toUpperCase();
    if (!trimmedCode) {
      return { success: false, message: "邀请码不能为空" };
    }

    const invitationCode = await prisma.invitationCode.findUnique({
      where: { code: trimmedCode },
    });

    if (!invitationCode) {
      return { success: false, message: "邀请码无效" };
    }

    if (invitationCode.status !== "ACTIVE") {
      return { success: false, message: "邀请码已失效" };
    }

    if (invitationCode.expiresAt && new Date(invitationCode.expiresAt) < new Date()) {
      return { success: false, message: "This invitation code has expired." };
    }

    await prisma.invitationCode.update({
      where: { code: trimmedCode },
      data: {
        status: "USED",
        usedByUserId,
        usedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("消耗邀请码失败:", error);
    return {
      success: false,
      message: "操作失败",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 切换已使用邀请码的启用/停用状态（USED <-> DEACTIVATED）
 * 用于管理端「停用」「启用」按钮，一键翻转状态
 */
export async function toggleInvitationCodeStatus(
  codeId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const code = await prisma.invitationCode.findUnique({
    where: { id: codeId },
    select: { status: true },
  });
  if (!code) return { success: false, message: "邀请码不存在" };
  if (code.status === "USED") return toggleCodeStatus(codeId, "DEACTIVATED");
  if (code.status === "DEACTIVATED") return toggleCodeStatus(codeId, "USED");
  return { success: false, message: "仅已使用的邀请码可切换启用/停用" };
}

/**
 * 切换邀请码状态（激活/停用）
 * ACTIVE/DISABLED 之间可切换；USED 可设为 DEACTIVATED 以禁止关联用户登录
 */
export async function toggleCodeStatus(
  codeId: string,
  status: InvitationCodeStatusStr
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, message: "请先登录" };
    }

    if (!["ACTIVE", "DISABLED", "DEACTIVATED", "USED"].includes(status)) {
      return { success: false, message: "无效的状态，只能是 ACTIVE、DISABLED、DEACTIVATED 或 USED" };
    }

    const code = await prisma.invitationCode.findUnique({
      where: { id: codeId },
      include: {
        school: { select: { id: true } },
      },
    });

    if (!code) {
      return { success: false, message: "邀请码不存在" };
    }

    // 已使用的邀请码仅可设为 DEACTIVATED（停用关联用户）
    if (code.status === "USED") {
      if (status !== "DEACTIVATED") {
        return { success: false, message: "已使用的邀请码仅可设为停用(DEACTIVATED)" };
      }
    } else if (code.status === "DEACTIVATED") {
      // DEACTIVATED 可恢复为 USED
      if (status !== "USED") {
        return { success: false, message: "已停用的邀请码仅可恢复为已使用(USED)" };
      }
    } else {
      // ACTIVE / DISABLED 仅可在两者间切换
      if (!["ACTIVE", "DISABLED"].includes(status)) {
        return { success: false, message: "未使用的邀请码只能在 ACTIVE 与 DISABLED 之间切换" };
      }
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, schoolId: true },
    });

    if (!currentUser) {
      return { success: false, message: "用户不存在" };
    }

    const isSuperAdmin = currentUser.role === appRoleToDbRole("SUPER_ADMIN");
    const isSchoolAdmin = currentUser.role === appRoleToDbRole("ADMIN");

    if (!isSuperAdmin && !isSchoolAdmin) {
      return { success: false, message: "权限不足" };
    }

    if (!isSuperAdmin && currentUser.schoolId !== code.schoolId) {
      return { success: false, message: "无权操作该学校的邀请码" };
    }

    await prisma.invitationCode.update({
      where: { id: codeId },
      data: { status: status as InvitationCodeStatus },
    });

    const msg =
      status === "ACTIVE"
        ? "已激活"
        : status === "DEACTIVATED"
          ? "已停用（关联用户将无法登录）"
          : status === "USED"
            ? "已启用（关联用户可正常登录）"
            : "已停用";
    return { success: true, message: msg };
  } catch (error) {
    console.error("切换邀请码状态失败:", error);
    return {
      success: false,
      message: "操作失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 延长邀请码有效期
 * 权限：只有发放人(createdByUserId)或超级管理员才能延长
 * 仅 ACTIVE 的邀请码可延长（包括已过期的 ACTIVE 邀请码）
 */
export async function extendInvitationCode(
  codeId: string,
  days: number = 7
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, message: "请先登录" };
    }

    const code = await prisma.invitationCode.findUnique({
      where: { id: codeId },
      select: {
        id: true,
        createdByUserId: true,
        status: true,
        expiresAt: true,
        schoolId: true,
      },
    });

    if (!code) {
      return { success: false, message: "邀请码不存在" };
    }

    if (code.status !== "ACTIVE") {
      return { success: false, message: "已使用的邀请码不能延长有效期" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, schoolId: true },
    });

    if (!currentUser) {
      return { success: false, message: "用户不存在" };
    }

    const isSuperAdmin = currentUser.role === appRoleToDbRole("SUPER_ADMIN");
    const isIssuer = code.createdByUserId === auth.userId;
    const isSchoolAdminOfSameSchool =
      currentUser.role === appRoleToDbRole("ADMIN") && currentUser.schoolId === code.schoolId;

    if (!isSuperAdmin && !isIssuer && !isSchoolAdminOfSameSchool) {
      return { success: false, message: "无权延长此邀请码的有效期" };
    }

    const currentExpiresAt = code.expiresAt ? new Date(code.expiresAt) : new Date();
    const newExpiresAt = new Date(currentExpiresAt);
    newExpiresAt.setDate(newExpiresAt.getDate() + Math.max(1, Math.min(days, 365)));

    await prisma.invitationCode.update({
      where: { id: codeId },
      data: { expiresAt: newExpiresAt },
    });

    return {
      success: true,
      message: `有效期已延长${days}天`,
    };
  } catch (error) {
    console.error("延长邀请码有效期失败:", error);
    return {
      success: false,
      message: "操作失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 撤销/删除邀请码
 * 仅当 status === ACTIVE（未使用）时可删除；已使用(USED)或已撤销(DISABLED)不可删除
 */
export async function deleteCode(
  codeId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, message: "请先登录" };
    }

    const code = await prisma.invitationCode.findUnique({
      where: { id: codeId },
      include: {
        school: { select: { id: true } },
      },
    });

    if (!code) {
      return { success: false, message: "邀请码不存在" };
    }

    // 仅允许删除未使用(ACTIVE)的邀请码
    if (code.status !== "ACTIVE") {
      if (code.status === "USED") {
        return { success: false, message: "已使用的邀请码无法删除" };
      }
      return { success: false, message: "已撤销的邀请码无法删除" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, schoolId: true },
    });

    if (!currentUser) {
      return { success: false, message: "用户不存在" };
    }

    const isSuperAdmin = currentUser.role === appRoleToDbRole("SUPER_ADMIN");
    const isSchoolAdmin = currentUser.role === appRoleToDbRole("ADMIN");

    if (!isSuperAdmin && !isSchoolAdmin) {
      return { success: false, message: "权限不足" };
    }

    if (!isSuperAdmin && currentUser.schoolId !== code.schoolId) {
      return { success: false, message: "无权删除该学校的邀请码" };
    }

    await prisma.invitationCode.delete({
      where: { id: codeId },
    });

    return { success: true, message: "已删除" };
  } catch (error) {
    console.error("删除邀请码失败:", error);
    return {
      success: false,
      message: "删除失败，请重试",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}
