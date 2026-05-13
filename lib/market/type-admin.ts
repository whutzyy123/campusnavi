"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import type { MarketActionResult } from "./types";

export { createTransactionType, updateTransactionType, deleteTransactionType };

/** 创建交易类型（仅超级管理员） */
async function createTransactionType(data: {
  name: string;
  code: string;
  order?: number;
}): Promise<MarketActionResult<{ id: number; name: string; code: string; order: number }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const trimmedName = data.name.trim();
    const trimmedCode = data.code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      return { success: false, error: "名称和 code 不能为空" };
    }
    const existing = await prisma.marketTransactionType.findFirst({
      where: { OR: [{ name: trimmedName }, { code: trimmedCode }] },
    });
    if (existing) {
      return { success: false, error: "名称或 code 已存在" };
    }
    const created = await prisma.marketTransactionType.create({
      data: {
        name: trimmedName,
        code: trimmedCode,
        order: typeof data.order === "number" ? data.order : 0,
      },
    });
    revalidatePath("/center/market");
    return {
      success: true,
      data: {
        id: created.id,
        name: created.name,
        code: created.code,
        order: created.order,
      },
    };
  } catch (err) {
    console.error("[createTransactionType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

/** 更新交易类型（仅超级管理员） */
async function updateTransactionType(
  id: number,
  data: { name?: string; code?: string; order?: number; isActive?: boolean }
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.code !== undefined) updates.code = data.code.trim().toUpperCase();
    if (typeof data.order === "number") updates.order = data.order;
    if (typeof data.isActive === "boolean") updates.isActive = data.isActive;
    if (Object.keys(updates).length === 0) {
      return { success: false, error: "没有需要更新的字段" };
    }
    await prisma.marketTransactionType.update({
      where: { id },
      data: updates,
    });
    revalidatePath("/center/market");
    return { success: true };
  } catch (err) {
    console.error("[updateTransactionType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}

/** 删除交易类型（仅超级管理员） */
async function deleteTransactionType(id: number): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    await prisma.marketTransactionType.delete({ where: { id } });
    revalidatePath("/center/market");
    return { success: true };
  } catch (err) {
    console.error("[deleteTransactionType]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}
