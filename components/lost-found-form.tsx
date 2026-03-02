"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ImageUpload } from "@/components/shared/image-upload";
import { uploadLostFoundImage } from "@/lib/upload-actions";
import { createLostFoundEvent } from "@/lib/lost-found-actions";
import toast from "react-hot-toast";

const MAX_IMAGES = 3;
const MAX_DESCRIPTION = 500;

interface LostFoundFormProps {
  poiId: string;
  schoolId: string;
  onSuccess?: () => void;
  onClose?: () => void;
  /** 是否以折叠/内嵌形式展示（在 drawer 内），否则作为独立区块 */
  inline?: boolean;
}

export function LostFoundForm({
  poiId,
  schoolId,
  onSuccess,
  onClose,
  inline = true,
}: LostFoundFormProps) {
  const [description, setDescription] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageLoadingCount, setImageLoadingCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageUploading = (loading: boolean) => {
    setImageLoadingCount((prev) => (loading ? prev + 1 : Math.max(0, prev - 1)));
  };

  const handleImageChange = (index: number) => (url: string) => {
    if (url) {
      setImages((prev) => {
        const next = [...prev];
        next[index] = url;
        return next.slice(0, MAX_IMAGES);
      });
    } else {
      setImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      toast.error("请填写物品描述");
      return;
    }

    if (description.trim().length > MAX_DESCRIPTION) {
      toast.error(`描述最多 ${MAX_DESCRIPTION} 字`);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("发布中...");

    try {
      const result = await createLostFoundEvent({
        poiId,
        description: description.trim(),
        images,
        contactInfo: contactInfo.trim() || null,
      });

      if (result.success) {
        toast.success("发布成功！信息将保留 24 小时", { id: toastId });
        setDescription("");
        setContactInfo("");
        setImages([]);
        onSuccess?.();
        onClose?.();
      } else {
        toast.error(result.error ?? "发布失败", { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 描述 */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          物品描述 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="请描述丢失/拾取的物品..."
          maxLength={MAX_DESCRIPTION}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
        />
        <p className="mt-1 text-xs text-gray-500">{description.length}/{MAX_DESCRIPTION}</p>
      </div>

      {/* 联系方式 */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">联系方式（可选）</label>
        <input
          type="text"
          value={contactInfo}
          onChange={(e) => setContactInfo(e.target.value)}
          placeholder="手机/微信"
          maxLength={100}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
        />
      </div>

      {/* 图片上传（最多 3 张，含客户端压缩） */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          图片（最多 {MAX_IMAGES} 张）
        </label>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: Math.min(images.length + 1, MAX_IMAGES) }).map((_, i) => (
            <ImageUpload
              key={i}
              value={images[i] ?? ""}
              onChange={handleImageChange(i)}
              onUploading={handleImageUploading}
              uploadFn={uploadLostFoundImage}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || imageLoadingCount > 0}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white hover:bg-[#E03D00] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          发布
        </button>
      </div>
    </form>
  );

  if (inline) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        {formContent}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {formContent}
    </div>
  );
}
