"use server";

/**
 * POI 图片上传与存储清理
 * 使用 Vercel Blob 存储，仅存储 URL 于数据库
 */

import { getAuthCookie } from "@/lib/auth-server-actions";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * 校验上传权限：仅 ADMIN 或 STAFF
 */
async function requireUploadPermission(): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getAuthCookie();
  if (!auth?.userId) {
    return { ok: false, error: "请先登录" };
  }
  if (auth.role !== "ADMIN" && auth.role !== "STAFF") {
    return { ok: false, error: "仅校管或工作人员可上传 POI 图片" };
  }
  return { ok: true };
}

/**
 * 上传 POI 图片到对象存储
 * 校验：仅 image/jpeg、image/png、image/webp，最大 2MB
 */
export async function uploadPOIImage(formData: FormData): Promise<UploadResult> {
  try {
    const authResult = await requireUploadPermission();
    if (!authResult.ok) {
      return { success: false, error: authResult.error };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "未找到上传文件" };
    }

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return {
        success: false,
        error: "仅支持 JPG、PNG、WebP 格式",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `文件大小超过 2MB 限制（当前 ${(file.size / 1024).toFixed(1)}KB）`,
      };
    }

    const ext = EXT_MAP[file.type] || "jpg";
    const pathname = `poi-images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    });

    return { success: true, url: blob.url };
  } catch (error) {
    console.error("POI 图片上传失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "上传失败，请重试",
    };
  }
}

/**
 * 上传失物招领图片（R16）
 * 任何已登录用户可上传，校验：image/jpeg、image/png、image/webp，最大 2MB
 */
export async function uploadLostFoundImage(formData: FormData): Promise<UploadResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "未找到上传文件" };
    }

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return {
        success: false,
        error: "仅支持 JPG、PNG、WebP 格式",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `文件大小超过 2MB 限制（当前 ${(file.size / 1024).toFixed(1)}KB）`,
      };
    }

    const ext = EXT_MAP[file.type] || "jpg";
    const pathname = `lost-found/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    });

    return { success: true, url: blob.url };
  } catch (error) {
    console.error("失物招领图片上传失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "上传失败，请重试",
    };
  }
}

/**
 * 上传生存集市商品图片（R30）
 * 任何已登录用户可上传，校验：image/jpeg、image/png、image/webp，最大 2MB
 */
export async function uploadMarketImage(formData: FormData): Promise<UploadResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "未找到上传文件" };
    }

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return {
        success: false,
        error: "仅支持 JPG、PNG、WebP 格式",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `文件大小超过 2MB 限制（当前 ${(file.size / 1024).toFixed(1)}KB）`,
      };
    }

    const ext = EXT_MAP[file.type] || "jpg";
    const pathname = `market/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    });

    return { success: true, url: blob.url };
  } catch (error) {
    console.error("生存集市图片上传失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "上传失败，请重试",
    };
  }
}

/**
 * 上传信息反馈/Bug 提交图片
 * 任何已登录用户可上传，校验：image/jpeg、image/png、image/webp，最大 2MB
 */
export async function uploadFeedbackImage(formData: FormData): Promise<UploadResult> {
  try {
    const auth = await getAuthCookie();
    if (!auth?.userId) {
      return { success: false, error: "请先登录" };
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "未找到上传文件" };
    }

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return {
        success: false,
        error: "仅支持 JPG、PNG、WebP 格式",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `文件大小超过 2MB 限制（当前 ${(file.size / 1024).toFixed(1)}KB）`,
      };
    }

    const ext = EXT_MAP[file.type] || "jpg";
    const pathname = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
    });

    return { success: true, url: blob.url };
  } catch (error) {
    console.error("反馈图片上传失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "上传失败，请重试",
    };
  }
}

/**
 * 从对象存储删除图片
 * 在 POI 更新（换图）或删除时调用，避免孤儿文件占用存储
 */
export async function deleteImageFromStorage(url: string): Promise<void> {
  if (!url || typeof url !== "string" || !url.trim()) {
    return;
  }

  try {
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch (error) {
    console.warn("删除存储图片失败（可能已不存在）:", url, error);
  }
}
