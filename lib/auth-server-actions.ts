"use server";

/**
 * 认证 Server Actions
 * 所有认证操作都在服务端执行，使用 HTTP Only Cookie 存储认证状态
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/auth-utils";
import { validateInvitationCode } from "@/lib/invitation-actions";

const AUTH_COOKIE_NAME = "campus-survival-auth-token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天（秒）

export interface AuthCookieData {
  userId: string;
  role: string;
  schoolId: string | null;
}

/**
 * 设置认证 Cookie（HTTP Only）
 */
async function setAuthCookie(data: AuthCookieData): Promise<void> {
  const cookieStore = await cookies();
  const cookieValue = JSON.stringify({
    userId: data.userId,
    role: data.role,
    schoolId: data.schoolId,
  });

  cookieStore.set(AUTH_COOKIE_NAME, cookieValue, {
    httpOnly: true, // 防止 XSS 攻击
    secure: process.env.NODE_ENV === "production", // 生产环境使用 HTTPS
    sameSite: "lax", // 防止 CSRF 攻击
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
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
    const data = JSON.parse(authCookie.value) as AuthCookieData;
    // 仅 ADMIN/STAFF 通过邀请码注册，需校验关联邀请码是否被停用
    if (data.role === "ADMIN" || data.role === "STAFF") {
      const invite = await prisma.invitationCode.findFirst({
        where: { usedByUserId: data.userId },
        select: { status: true },
      });
      if (invite?.status === "DEACTIVATED") {
        await removeAuthCookie();
        return null;
      }
    }
    return data;
  } catch (error) {
    console.error("解析认证 Cookie 失败:", error);
    return null;
  }
}

/**
 * 清除认证 Cookie（供登出、注销等场景使用）
 */
export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * 用户登录 Server Action
 */
export async function loginUser(formData: FormData) {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "login-initial",
        hypothesisId: "H1",
        location: "lib/auth-server-actions.ts:loginUser:missing-params",
        message: "Login called with missing email or password",
        data: { hasEmail: !!email, hasPassword: !!password },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    return {
      success: false,
      message: "请填写邮箱和密码",
    };
  }

  try {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "login-initial",
        hypothesisId: "H2",
        location: "lib/auth-server-actions.ts:loginUser:before-find",
        message: "About to query user by email",
        data: { email: email.trim().toLowerCase() },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

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
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "login-initial",
          hypothesisId: "H3",
          location: "lib/auth-server-actions.ts:loginUser:user-not-found",
          message: "No user found for email",
          data: { email: email.trim().toLowerCase() },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log

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

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "login-initial",
        hypothesisId: "H4",
        location: "lib/auth-server-actions.ts:loginUser:before-verify",
        message: "Verifying password",
        data: { userId: user.id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "login-initial",
          hypothesisId: "H5",
          location: "lib/auth-server-actions.ts:loginUser:password-invalid",
          message: "Password verification failed",
          data: { userId: user.id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log

      return {
        success: false,
        message: "邮箱或密码错误",
      };
    }

    // 角色映射：1 -> STUDENT, 2 -> ADMIN, 3 -> STAFF, 4 -> SUPER_ADMIN
    const roleMap: Record<number, string> = {
      1: "STUDENT",
      2: "ADMIN",
      3: "STAFF",
      4: "SUPER_ADMIN",
    };

    const userRole = roleMap[user.role] || "STUDENT";

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

    // 设置认证 Cookie
    await setAuthCookie({
      userId: user.id,
      role: userRole,
      schoolId: user.schoolId || null,
    });

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "login-initial",
        hypothesisId: "H6",
        location: "lib/auth-server-actions.ts:loginUser:success",
        message: "Login success, returning user data",
        data: { userId: user.id, role: userRole },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

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
    // 对 NEXT_REDIRECT 不做处理，直接抛出，让 Next.js 完成重定向
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }

    console.error("Login Error:", error);

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "login-initial",
        hypothesisId: "H7",
        location: "lib/auth-server-actions.ts:loginUser:catch",
        message: "Login threw a non-redirect error",
        data: {
          errorMessage: error instanceof Error ? error.message : "未知错误",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

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

    // 角色映射
    const roleMap: Record<string, number> = {
      STUDENT: 1,
      ADMIN: 2,
      STAFF: 3,
    };

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
          role: roleMap[role],
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

    // 设置认证 Cookie
    await setAuthCookie({
      userId: user.id,
      role: role,
      schoolId: user.schoolId || null,
    });

    // 根据角色重定向
    if (role === "SUPER_ADMIN") {
      redirect("/super-admin");
    } else if (role === "ADMIN" || role === "STAFF") {
      redirect("/admin");
    } else {
      redirect("/");
    }
  } catch (error) {
    // 关键修复：不要拦截 Next.js 的跳转信号
    // redirect() 会抛出一个包含 "NEXT_REDIRECT" 的特殊错误
    // 我们需要重新抛出这个错误，让 Next.js 正常处理跳转
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }

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
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
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

