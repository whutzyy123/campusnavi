"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { getAuthCookie } from "@/lib/auth/server-actions";
import type { MarketActionResult } from "./types";

export { createMarketCategory, updateMarketCategory, deleteMarketCategory, toggleTypeCategory };

/** 创建物品分类（仅超级管理员） */
async function createMarketCategory(data: {
  name: string;
  order?: number;
}): Promise<MarketActionResult<{ id: string; name: string; order: number }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      return { success: false, error: "名称不能为空" };
    }
    const existing = await prisma.marketCategory.findFirst({
      where: { name: trimmedName },
    });
    if (existing) {
      return { success: false, error: "分类名称已存在" };
    }
    const created = await prisma.marketCategory.create({
      data: {
        name: trimmedName,
        order: typeof data.order === "number" ? data.order : 0,
      },
    });
    revalidatePath("/center/market");
    return {
      success: true,
      data: {
        id: created.id,
        name: created.name,
        order: created.order,
      },
    };
  } catch (err) {
    console.error("[createMarketCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

/** 更新物品分类（仅超级管理员） */
async function updateMarketCategory(
  id: string,
  data: { name?: string; order?: number; isActive?: boolean }
): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (typeof data.order === "number") updates.order = data.order;
    if (typeof data.isActive === "boolean") updates.isActive = data.isActive;
    if (Object.keys(updates).length === 0) {
      return { success: false, error: "没有需要更新的字段" };
    }
    await prisma.marketCategory.update({
      where: { id },
      data: updates,
    });
    revalidatePath("/center/market");
    return { success: true };
  } catch (err) {
    console.error("[updateMarketCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}

/** 删除物品分类（仅超级管理员） */
async function deleteMarketCategory(id: string): Promise<MarketActionResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    await prisma.marketCategory.delete({ where: { id } });
    revalidatePath("/center/market");
    return { success: true };
  } catch (err) {
    console.error("[deleteMarketCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

/** 切换交易类型与分类的关联（仅超级管理员） */
async function toggleTypeCategory(
  typeId: number,
  categoryId: string
): Promise<MarketActionResult<{ linked: boolean }>> {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== "SUPER_ADMIN") {
      return { success: false, error: "仅超级管理员可操作" };
    }
    const existing = await prisma.marketTypeCategory.findUnique({
      where: {
        transactionTypeId_categoryId: { transactionTypeId: typeId, categoryId },
      },
    });
    if (existing) {
      await prisma.marketTypeCategory.delete({
        where: {
          transactionTypeId_categoryId: { transactionTypeId: typeId, categoryId },
        },
      });
      return { success: true, data: { linked: false } };
    } else {
      await prisma.marketTypeCategory.create({
        data: {
          transactionTypeId: typeId,
          categoryId,
        },
      });
      return { success: true, data: { linked: true } };
    }
  } catch (err) {
    console.error("[toggleTypeCategory]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}
