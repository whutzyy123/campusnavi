"use server";

import { getAuthCookie } from "@/lib/auth/server-actions";
import { prisma } from "@/lib/core/prisma";
import { getChinaDateKey } from "@/lib/core/utils";

const CHECK_IN_REWARD = 5;

export type PointsActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

function isCheckedInToday(lastCheckInAt: Date | null): boolean {
  if (!lastCheckInAt) return false;
  return getChinaDateKey(lastCheckInAt) === getChinaDateKey();
}

/**
 * 查询当前用户今日是否已签到及积分
 */
export async function getDailyCheckInStatus(): Promise<
  PointsActionResult<{ checkedInToday: boolean; points: number }>
> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "请先登录" };
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { points: true, lastCheckInAt: true, status: true },
    });

    if (!user) {
      return { success: false, error: "用户不存在" };
    }

    if (user.status !== "ACTIVE") {
      return { success: false, error: "账户不可用" };
    }

    return {
      success: true,
      data: {
        checkedInToday: isCheckedInToday(user.lastCheckInAt),
        points: user.points,
      },
    };
  } catch (err) {
    console.error("[getDailyCheckInStatus]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取签到状态失败",
    };
  }
}

/**
 * 每日签到：+5 积分，每个账号每个中国日历日仅一次
 */
export async function dailyCheckIn(): Promise<
  PointsActionResult<{ points: number; checkedInToday: true; reward: number }>
> {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return { success: false, error: "请先登录" };
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: auth.userId },
        select: { id: true, points: true, lastCheckInAt: true, status: true },
      });

      if (!user) {
        throw new Error("用户不存在");
      }

      if (user.status !== "ACTIVE") {
        throw new Error("账户不可用");
      }

      if (isCheckedInToday(user.lastCheckInAt)) {
        return {
          kind: "already" as const,
          points: user.points,
        };
      }

      const now = new Date();
      const updated = await tx.user.update({
        where: { id: auth.userId },
        data: {
          points: { increment: CHECK_IN_REWARD },
          lastCheckInAt: now,
        },
        select: { points: true },
      });

      return {
        kind: "success" as const,
        points: updated.points,
      };
    });

    if (result.kind === "already") {
      return { success: false, error: "今日已签到" };
    }

    return {
      success: true,
      data: {
        points: result.points,
        checkedInToday: true,
        reward: CHECK_IN_REWARD,
      },
    };
  } catch (err) {
    console.error("[dailyCheckIn]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "签到失败，请稍后重试",
    };
  }
}
