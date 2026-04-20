"use server";

/**
 * 认证 Server Actions
 * 所有认证操作都在服务端执行，使用 HTTP Only Cookie 存储认证状态
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, needsPasswordRehash } from "@/lib/auth-utils";
import { validateInvitationCode } from "@/lib/invitation-actions";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";
import { dbRoleToAppRole, registerableRoleToDbRole, type RegisterableAppRole } from "@/lib/role";

function isNextRedirectError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("NEXT_REDIRECT");
}

const AUTH_COOKIE_NAME = "campus-survival-session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天（秒）

export interface AuthCookieData {
  userId: string;
  role: string;
  schoolId: string | null;
}

/**
 * 设置认证 Cookie（HTTP Only）
 */
async function setAuthCookie(sessionToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, sessionToken, {
    httpOnly: true, // 防止 XSS 攻击
    secure: process.env.NODE_ENV === "production", // 生产环境使用 HTTPS
    sameSite: "lax", // 防止 CSRF 攻击
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

async function createSession(userId: string): Promise<string> {
  const sessionToken = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000);
  await prisma.authSession.create({
    data: {
      sessionToken,
      userId,
      expiresAt,
    },
    select: { id: true },
  });
  return sessionToken;
}

function getClientIp(): string {
  return getClientIpFromHeaders(headers());
}

/**
 * 获取认证 Cookie
 * 会校验关联邀请码状态：若邀请码为 DEACTIVATED，则清除会话并返回 null
 */
export async function getAuthCookie(): Promise<AuthCookieData | null> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);

  if (!authCookie) {
    return null;
  }

  try {
    const now = new Date();
    const session = await prisma.authSession.findFirst({
      where: {
        sessionToken: authCookie.value,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            role: true,
            schoolId: true,
            status: true,
          },
        },
      },
    });

    if (!session?.user) {
      await removeAuthCookie();
      return null;
    }

    if (session.user.status === "INACTIVE") {
      await removeAuthCookie();
      return null;
    }

    const role = dbRoleToAppRole(session.user.role);
    if (!role) {
      await removeAuthCookie();
      return null;
    }

    if (role === "ADMIN" || role === "STAFF") {
      const invite = await prisma.invitationCode.findFirst({
        where: { usedByUserId: session.user.id },
        select: { status: true },
      });
      if (invite?.status === "DEACTIVATED") {
        await removeAuthCookie();
        return null;
      }
    }

    return {
      userId: session.user.id,
      role,
      schoolId: session.user.schoolId,
    };
  } catch (error) {
    console.error("解析认证 Cookie 失败:", error);
    await removeAuthCookie();
    return null;
  }
}

/**
 * 清除认证 Cookie（供登出、注销等场景使用）
 */
export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  cookieStore.delete(AUTH_COOKIE_NAME);
  if (authCookie?.value) {
    await prisma.authSession.updateMany({
      where: { sessionToken: authCookie.value, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/**
 * 用户登录 Server Action
 */
export async function loginUser(formData: FormData) {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return {
      success: false,
      message: "请填写邮箱和密码",
    };
  }

  try {
    const ip = getClientIp();
    const emailKey = email.trim().toLowerCase();
    const okByIp = await consumeRateLimit(`auth:login:ip:${ip}`, 20, 5 * 60 * 1000);
    const okByEmail = await consumeRateLimit(`auth:login:email:${emailKey}`, 10, 5 * 60 * 1000);
    if (!okByIp || !okByEmail) {
      return {
        success: false,
        message: "请求过于频繁，请稍后再试",
      };
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        nickname: true,
        password: true,
        role: true,
        schoolId: true,
        status: true,
        school: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        message: "邮箱或密码错误",
      };
    }

    // 检查账户状态
    if ((user as { status?: string }).status === "INACTIVE") {
      return {
        success: false,
        message: "该账户已被停用，请联系管理员",
      };
    }

    // 验证密码
    if (!user.password) {
      return {
        success: false,
        message: "该账户未设置密码，请先注册",
      };
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return {
        success: false,
        message: "邮箱或密码错误",
      };
    }

    if (needsPasswordRehash(user.password)) {
      const nextHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: nextHash },
        select: { id: true },
      });
    }

    const userRole = dbRoleToAppRole(user.role);
    if (!userRole) {
      return {
        success: false,
        message: "账户数据异常，请联系管理员",
      };
    }

    // ADMIN/STAFF 通过邀请码注册，校验关联邀请码是否被停用
    if (userRole === "ADMIN" || userRole === "STAFF") {
      const invite = await prisma.invitationCode.findFirst({
        where: { usedByUserId: user.id },
        select: { status: true },
      });
      if (invite?.status === "DEACTIVATED") {
        return {
          success: false,
          message: "您的账号关联的邀请码已被停用，请联系管理员。",
        };
      }
    }

    const sessionToken = await createSession(user.id);
    await setAuthCookie(sessionToken);

    // 返回用户信息，由前端决定跳转逻辑
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: userRole,
        schoolId: user.schoolId || null,
        schoolName: user.school?.name || null,
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("Login Error:", error);

    return {
      success: false,
      message: "服务器内部错误",
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 用户注册 Server Action
 */
export async function registerUser(formData: FormData) {
  const email = formData.get("email")?.toString();
  const nickname = formData.get("nickname")?.toString();
  const password = formData.get("password")?.toString();
  const role = formData.get("role")?.toString();
  const schoolId = formData.get("schoolId")?.toString();
  const invitationCode = formData.get("invitationCode")?.toString();
  const agreedRaw = formData.get("agreed")?.toString();
  const agreed = agreedRaw === "true" || agreedRaw === "on";

  if (!agreed) {
    return {
      success: false,
      message: "You must agree to the terms before registering.",
    };
  }

  if (!email || !nickname || !password || !role) {
    return {
      success: false,
      message: "请填写所有必填字段",
    };
  }

  // 验证角色
  if (!["STUDENT", "ADMIN", "STAFF"].includes(role)) {
    return {
      success: false,
      message: "无效的角色",
    };
  }

  try {
    const ip = getClientIp();
    const emailKey = email.trim().toLowerCase();
    const okByIp = await consumeRateLimit(`auth:register:ip:${ip}`, 10, 10 * 60 * 1000);
    const okByEmail = await consumeRateLimit(`auth:register:email:${emailKey}`, 5, 10 * 60 * 1000);
    if (!okByIp || !okByEmail) {
      return {
        success: false,
        message: "请求过于频繁，请稍后再试",
      };
    }

    // 这里应该调用注册 API 的逻辑
    // 为了简化，我们直接调用现有的注册路由逻辑
    // 实际应该将注册逻辑提取为共享函数

    // 验证邀请码（Code-First：ADMIN/STAFF 必须提供有效邀请码）
    let targetSchoolId = schoolId || null;
    const trimmedCode = invitationCode?.trim().toUpperCase() || null;

    if (role === "ADMIN" || role === "STAFF") {
      if (!trimmedCode) {
        return {
          success: false,
          message: "管理员和工作人员需要邀请码",
        };
      }

      const validation = await validateInvitationCode(trimmedCode);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.message || "邀请码无效",
        };
      }

      // 邀请码角色必须与表单角色一致
      if (validation.roleType !== role) {
        return {
          success: false,
          message: "邀请码角色与所选身份不匹配",
        };
      }

      targetSchoolId = validation.schoolId;
    } else {
      // 学生必须选择学校
      if (!schoolId) {
        return {
          success: false,
          message: "请选择学校",
        };
      }
    }

    // 验证学校是否存在
    const school = await prisma.school.findUnique({
      where: { id: targetSchoolId! },
      select: { id: true },
    });

    if (!school) {
      return {
        success: false,
        message: "学校不存在",
      };
    }

    const registerRole = role as RegisterableAppRole;

    // 创建用户（使用事务，邀请码消耗在事务内完成）
    const user = await prisma.$transaction(async (tx) => {
      // 检查邮箱是否已存在
      const existingUser = await tx.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });

      if (existingUser) {
        throw new Error("邮箱已被注册");
      }

      // 哈希密码
      const hashedPassword = await hashPassword(password);

      // 创建用户
      const newUser = await tx.user.create({
        data: {
          email: email.trim().toLowerCase(),
          nickname: nickname.trim(),
          password: hashedPassword,
          role: registerableRoleToDbRole(registerRole),
          schoolId: targetSchoolId,
        },
      });

      // 如果使用了邀请码，消耗邀请码（status=USED, usedByUserId, usedAt）
      if (trimmedCode) {
        const consumed = await tx.invitationCode.updateMany({
          where: { code: trimmedCode, status: "ACTIVE" },
          data: {
            status: "USED",
            usedByUserId: newUser.id,
            usedAt: new Date(),
          },
        });
        if (consumed.count === 0) {
          throw new Error("邀请码已被使用或已失效，请刷新后重试");
        }
      }

      return newUser;
    });

    const sessionToken = await createSession(user.id);
    await setAuthCookie(sessionToken);

    // 根据角色重定向（注册仅允许 STUDENT / ADMIN / STAFF）
    if (role === "ADMIN" || role === "STAFF") {
      redirect("/admin");
    } else {
      redirect("/");
    }
  } catch (error) {
    // 关键修复：不要拦截 Next.js 的跳转信号
    // redirect() 会抛出一个包含 "NEXT_REDIRECT" 的特殊错误
    // 我们需要重新抛出这个错误，让 Next.js 正常处理跳转
    if (isNextRedirectError(error)) throw error;

    // 处理其他业务错误
    console.error("注册失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "注册失败，请重试",
    };
  }
}

/**
 * 用户登出 Server Action
 * 清除 Cookie 后重定向到登录页。redirect() 会抛出 NEXT_REDIRECT，不可被 try/catch 吞掉。
 */
export async function logoutUser() {
  await removeAuthCookie();
  redirect("/login");
}

/**
 * 验证用户是否有管理员权限
 */
export async function requireAdmin(): Promise<AuthCookieData> {
  const authData = await getAuthCookie();

  if (!authData) {
    redirect("/login");
  }

  if (authData.role !== "ADMIN" && authData.role !== "STAFF" && authData.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return authData;
}

/**
 * 获取当前认证用户信息（不重定向）
 */
export async function getCurrentUser(): Promise<AuthCookieData | null> {
  return await getAuthCookie();
}

/** getMe 返回的用户对象（与 /api/auth/me 一致） */
export interface MeUser {
  id: string;
  email: string | null;
  nickname: string | null;
  bio: string | null;
  avatar: string | null;
  lastProfileUpdateAt: string | null;
  role: string; // "STUDENT" | "ADMIN" | "STAFF" | "SUPER_ADMIN"
  schoolId: string | null;
  schoolName: string | null;
}

export type GetMeResult =
  | { success: true; user: MeUser }
  | { success: false; error: string };

/**
 * 获取当前登录用户完整信息（替代 /api/auth/me）
 * 用于客户端初始化认证状态、个人资料表单等
 */
export async function getMe(): Promise<GetMeResult> {
  try {
    const authData = await getAuthCookie();

    if (!authData) {
      return { success: false, error: "未登录" };
    }

    const user = await prisma.user.findUnique({
      where: { id: authData.userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        bio: true,
        avatar: true,
        lastProfileUpdateAt: true,
        role: true,
        schoolId: true,
        status: true,
        school: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return { success: false, error: "用户不存在" };
    }

    if (user.status === "INACTIVE") {
      await removeAuthCookie();
      return { success: false, error: "该账户已被停用" };
    }

    const userRole = dbRoleToAppRole(user.role);
    if (!userRole) {
      await removeAuthCookie();
      return { success: false, error: "账户数据异常，请联系管理员" };
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        bio: user.bio,
        avatar: user.avatar ?? null,
        lastProfileUpdateAt: user.lastProfileUpdateAt?.toISOString() ?? null,
        role: userRole,
        schoolId: user.schoolId ?? null,
        schoolName: user.school?.name ?? null,
      },
    };
  } catch (err) {
    console.error("getMe 失败:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "服务器内部错误",
    };
  }
}
