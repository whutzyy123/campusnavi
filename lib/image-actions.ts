"use server";

/**
 * Generic image upload Server Action
 * Uses Vercel Blob storage with BLOB_READ_WRITE_TOKEN
 */

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface UploadImageResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an image file to Vercel Blob storage.
 * - Expects 'file' in FormData
 * - Uses put() from @vercel/blob with access: 'public'
 * - Returns the resulting URL on success
 */
export async function uploadImageAction(
  formData: FormData
): Promise<UploadImageResult> {
  try {
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

    const ext = EXT_MAP[file.type] || "jpg";
    const pathname = `images/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, file, {
      access: "public",
    });

    return { success: true, url: blob.url };
  } catch (error) {
    console.error("图片上传失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "上传失败，请重试",
    };
  }
}
