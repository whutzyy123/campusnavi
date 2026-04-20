"use server";

/**
 * 中控台 Server Actions
 * 处理用户资料更新、邮箱换绑、密码修改等操作
 */

import { getAuthCookie } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, needsPasswordRehash } from "@/lib/auth-utils";
import { validateContent } from "@/lib/content-validator";

const PROFILE_UPDATE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * 更新个人资料（昵称、头像、简介）
 * 昵称和头像受 7 天冷却限制
 */
export async function updateProfile(formData: FormData) {
  try {
    const auth = await getAuthCookie();
    if (!auth || !auth.userId) {
      return { success: false, message: "请先登录" };
    }

    const nickname = formData.get("nickname")?.toString();
    const bio = formData.get("bio")?.toString();
    const avatar = formData.get("avatar")?.toString();

    if (!nickname || nickname.trim().length === 0) {
      return { success: false, message: "昵称不能为空" };
    }

    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      return { success: false, message: "昵称长度必须在 2-20 个字符之间" };
    }

    // 昵称敏感词校验 + 数字序列屏蔽
    let sanitizedNickname: string;
    try {
      sanitizedNickname = (await validateContent(trimmedNickname, { checkNumbers: true })).trim();
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。" };
    }

    if (bio && bio.trim().length > 200) {
      return { success: false, message: "个人简介最多 200 个字符" };
    }

    // 个人简介敏感词校验 + 数字序列屏蔽
    let sanitizedBio: string | null = bio?.trim() || null;
    if (sanitizedBio) {
      try {
        sanitizedBio = (await validateContent(sanitizedBio, { checkNumbers: true })).trim();
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : "内容包含敏感词汇，请修改后重试。" };
      }
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { nickname: true, avatar: true, lastProfileUpdateAt: true },
    });

    if (!currentUser) {
      return { success: false, message: "用户不存在" };
    }

    const isChangingNickname = sanitizedNickname !== (currentUser.nickname ?? "");
    const isChangingAvatar = avatar !== undefined && avatar !== (currentUser.avatar ?? "");

    if (isChangingNickname || isChangingAvatar) {
      const lastUpdate = currentUser.lastProfileUpdateAt;
      if (lastUpdate) {
        const elapsed = Date.now() - lastUpdate.getTime();
        if (elapsed < PROFILE_UPDATE_COOLDOWN_MS) {
          const nextAllowed = new Date(lastUpdate.getTime() + PROFILE_UPDATE_COOLDOWN_MS);
          const nextStr = nextAllowed.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
          return {
            success: false,
            message: `为了社区安全，昵称和头像每 7 天仅限修改一次。下次可修改时间：${nextStr}`,
          };
        }
      }
    }

    const updateData: { nickname: string; bio: string | null; avatar?: string | null; lastProfileUpdateAt?: Date } = {
      nickname: sanitizedNickname,
      bio: sanitizedBio,
    };

    if (avatar !== undefined) {
      updateData.avatar = avatar || null;
    }

    if (isChangingNickname || isChangingAvatar) {
      updateData.lastProfileUpdateAt = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id: auth.userId },
      data: updateData,
      select: {
        id: true,
        nickname: true,
        bio: true,
        avatar: true,
        lastProfileUpdateAt: true,
        email: true,
        role: true,
        schoolId: true,
      },
    });

    return {
      success: true,
      message: "资料更新成功",
      user: {
        ...updatedUser,
        lastProfileUpdateAt: updatedUser.lastProfileUpdateAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    console.error("更新资料失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "更新资料失败，请重试",
    };
  }
}

/**
 * 换绑邮箱
 */
export async function updateEmail(formData: FormData) {
  try {
    // 获取当前用户
    const auth = await getAuthCookie();
    if (!auth || !auth.userId) {
      return {
        success: false,
        message: "请先登录",
      };
    }

    const newEmail = formData.get("newEmail")?.toString();
    const password = formData.get("password")?.toString();

    // 验证必填字段
    if (!newEmail || !password) {
      return {
        success: false,
        message: "请填写新邮箱和当前密码",
      };
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!emailRegex.test(trimmedEmail)) {
      return {
        success: false,
        message: "邮箱格式不正确",
      };
    }

    // 获取当前用户信息（包含密码）
    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!currentUser) {
      return {
        success: false,
        message: "用户不存在",
      };
    }

    // 验证当前密码
    if (!currentUser.password) {
      return {
        success: false,
        message: "该账户未设置密码，无法换绑邮箱",
      };
    }

    const isPasswordValid = await verifyPassword(password, currentUser.password);
    if (!isPasswordValid) {
      return {
        success: false,
        message: "当前密码错误",
      };
    }

    if (needsPasswordRehash(currentUser.password)) {
      const nextHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: auth.userId },
        data: { password: nextHash },
        select: { id: true },
      });
    }

    // 检查新邮箱是否已被占用
    const existingUser = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingUser && existingUser.id !== auth.userId) {
      return {
        success: false,
        message: "该邮箱已被其他用户使用",
      };
    }

    // 如果新邮箱与当前邮箱相同，无需更新
    if (currentUser.email === trimmedEmail) {
      return {
        success: false,
        message: "新邮箱与当前邮箱相同",
      };
    }

    // 更新邮箱
    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        email: trimmedEmail,
      },
    });

    // 更新 Cookie 中的用户信息（如果需要）
    // 注意：邮箱换绑后，建议用户重新登录以确保安全
    // 这里我们只更新数据库，不更新 Cookie，让用户重新登录

    return {
      success: true,
      message: "邮箱换绑成功，请重新登录",
      requiresReauth: true, // 标记需要重新登录
    };
  } catch (error) {
    console.error("换绑邮箱失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "换绑邮箱失败，请重试",
    };
  }
}

/**
 * 修改密码
 */
export async function updatePassword(formData: FormData) {
  try {
    // 获取当前用户
    const auth = await getAuthCookie();
    if (!auth || !auth.userId) {
      return {
        success: false,
        message: "请先登录",
      };
    }

    const oldPassword = formData.get("oldPassword")?.toString();
    const newPassword = formData.get("newPassword")?.toString();
    const confirmPassword = formData.get("confirmPassword")?.toString();

    // 验证必填字段
    if (!oldPassword || !newPassword || !confirmPassword) {
      return {
        success: false,
        message: "请填写所有必填字段",
      };
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      return {
        success: false,
        message: "新密码长度至少为 6 位",
      };
    }

    // 验证两次输入的新密码是否一致
    if (newPassword !== confirmPassword) {
      return {
        success: false,
        message: "两次输入的新密码不一致",
      };
    }

    // 验证新密码不能与旧密码相同
    if (oldPassword === newPassword) {
      return {
        success: false,
        message: "新密码不能与当前密码相同",
      };
    }

    // 获取当前用户信息（包含密码）
    const currentUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!currentUser) {
      return {
        success: false,
        message: "用户不存在",
      };
    }

    // 验证当前密码
    if (!currentUser.password) {
      return {
        success: false,
        message: "该账户未设置密码，无法修改",
      };
    }

    const isPasswordValid = await verifyPassword(oldPassword, currentUser.password);
    if (!isPasswordValid) {
      return {
        success: false,
        message: "当前密码错误",
      };
    }

    if (needsPasswordRehash(currentUser.password)) {
      const nextHash = await hashPassword(oldPassword);
      await prisma.user.update({
        where: { id: auth.userId },
        data: { password: nextHash },
        select: { id: true },
      });
    }

    // 哈希新密码
    const hashedNewPassword = await hashPassword(newPassword);

    // 更新密码
    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        password: hashedNewPassword,
      },
    });

    return {
      success: true,
      message: "密码修改成功",
    };
  } catch (error) {
    console.error("修改密码失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "修改密码失败，请重试",
    };
  }
}
