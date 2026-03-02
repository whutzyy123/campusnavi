/**
 * Client-side image compression utility
 * Pure module, no UI framework dependency.
 */

import imageCompression from "browser-image-compression";

const SKIP_COMPRESSION_THRESHOLD_BYTES = 800 * 1024; // 800KB
const TARGET_MAX_SIZE_MB = 1;
const MAX_WIDTH_OR_HEIGHT = 1920;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

/**
 * Compress an image file for upload.
 * - Target size: < 1MB (safely under 2MB server limit)
 * - Max dimensions: 1920px (HD), high quality
 * - Skips compression if input is already < 800KB
 * - On error or non-image file, returns original file as fallback
 *
 * @param file - Input image file (JPEG, PNG, WebP, BMP)
 * @returns Compressed File with original name, or original on skip/error/non-image
 */
export async function compressImage(file: File): Promise<File> {
  // Guard: non-image files return as-is (no crash)
  if (!file.type || !IMAGE_TYPES.includes(file.type)) {
    return file;
  }

  // Skip compression if already small enough
  if (file.size < SKIP_COMPRESSION_THRESHOLD_BYTES) {
    return file;
  }

  try {
    // For PNG: convert to JPEG to reduce size (JPEG is typically smaller)
    const isPng = file.type === "image/png";
    const fileType = isPng ? "image/jpeg" : undefined; // Preserve WebP/JPEG, convert PNG to JPEG

    const options = {
      maxSizeMB: TARGET_MAX_SIZE_MB,
      maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
      useWebWorker: true,
      initialQuality: 0.92,
      fileType,
    };

    const compressed = await imageCompression(file, options);

    // Preserve original filename (adjust extension if we converted PNG to JPEG)
    const outputName = isPng
      ? file.name.replace(/\.png$/i, ".jpg")
      : file.name;

    // Ensure we return a File with the correct name (library may change it)
    if (compressed.name !== outputName) {
      return new File([compressed], outputName, {
        type: compressed.type,
        lastModified: Date.now(),
      });
    }

    return compressed;
  } catch (error) {
    console.warn("Image compression failed, using original file:", error);
    return file;
  }
}
