"use client";

import { useState, useRef, useEffect } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
import { compressImage } from "@/lib/image-utils";
import { uploadImageAction } from "@/lib/image-actions";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export interface ImageUploadProps {
  /** Existing image URL */
  value?: string;
  /** Called when upload finishes with the new URL, or empty string when cleared */
  onChange: (url: string) => void;
  /** Optional: parent notified when loading (compress or upload) - use to disable submit */
  onUploading?: (loading: boolean) => void;
  /** Optional: custom upload function (e.g. uploadPOIImage for auth). Default: uploadImageAction */
  uploadFn?: (formData: FormData) => Promise<{ success: boolean; url?: string; error?: string }>;
  /** Optional: additional class names */
  className?: string;
}

/**
 * Reusable single-image upload component.
 * Workflow: Select File -> compressImage -> upload -> onChange(url)
 * Self-contained: handles compression and upload internally.
 */
export function ImageUpload({
  value,
  onChange,
  onUploading,
  uploadFn = uploadImageAction,
  className,
}: ImageUploadProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = isCompressing || isUploading;
  const hasValue = !!value?.trim();

  // Notify parent when loading state changes
  useEffect(() => {
    onUploading?.(isLoading);
  }, [isLoading, onUploading]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // User cancelled file picker - no file selected
    if (!file) {
      e.target.value = "";
      return;
    }

    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setIsCompressing(false);
      setIsUploading(true);

      const fd = new FormData();
      fd.append("file", compressed);
      const result = await uploadFn(fd);

      if (result.success && result.url) {
        onChange(result.url);
      } else {
        onChange("");
        if (result.error) toast.error(result.error);
      }
    } catch (err) {
      onChange("");
      console.warn("Image upload failed:", err);
    } finally {
      setIsCompressing(false);
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = () => {
    onChange("");
    fileInputRef.current && (fileInputRef.current.value = "");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative flex h-32 w-40 flex-shrink-0 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50">
        {isLoading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">
              {isCompressing ? "压缩中..." : "上传中..."}
            </span>
          </div>
        ) : hasValue && value ? (
          <>
            <Image
              src={value}
              alt="预览"
              fill
              className="object-cover"
              unoptimized={value.startsWith("blob:")}
              sizes="160px"
            />
            <div className="absolute right-2 top-2 flex gap-1">
              <label className="cursor-pointer rounded-full bg-white/90 p-1.5 text-gray-700 shadow transition-colors hover:bg-white">
                <ImagePlus className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isLoading}
                />
              </label>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full bg-red-500/90 p-1.5 text-white shadow transition-colors hover:bg-red-600"
                title="删除"
                aria-label="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-gray-500 transition-colors hover:bg-gray-100">
            <ImagePlus className="h-8 w-8" />
            <span className="text-xs">点击上传</span>
            <span className="text-xs">JPG/PNG/WebP ≤2MB</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </label>
        )}
      </div>
    </div>
  );
}
