"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { createSquarePost } from "@/lib/actions/square-post";
import { uploadSquarePostImage } from "@/lib/actions/upload";
import { ImageUpload } from "@/components/shared/image-upload";
import { POICombobox } from "@/components/market/poi-combobox";
import { Loader2, ArrowLeft, Send, MapPin, Globe, School, Map, X } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { cn } from "@/lib/core/utils";
import { Button } from "@/components/ui/button";
import { FixedSubmitBar, FIXED_SUBMIT_BAR_CONTENT_PADDING } from "@/components/shared/fixed-submit-bar";

const MAX_IMAGES = 9;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 5000;

function SquarePostEditor() {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const { pickedPOI, clearPickedPOI } = useSchoolStore();
  const schoolId = currentUser?.schoolId ?? "";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<{ id: string; name: string } | null>(null);
  const [scope, setScope] = useState<"INTRA" | "INTER">("INTRA");
  const [imageLoadingCount, setImageLoadingCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 从地图选点结果回填
  useEffect(() => {
    if (pickedPOI) {
      setSelectedPOI(pickedPOI);
      clearPickedPOI();
    }
  }, [pickedPOI, clearPickedPOI]);

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

  const isFormValid = title.trim().length > 0 && content.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      notify.error("请填写标题和内容");
      return;
    }
    if (!schoolId) {
      notify.error("未绑定学校，无法发帖");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createSquarePost({
        title: title.trim(),
        content: content.trim(),
        images,
        poiId: selectedPOI?.id ?? null,
        scope,
      });
      if (result.success) {
        notify.success("发布成功");
        router.push("/square");
        router.refresh();
      } else {
        notify.error(result.error || "发布失败");
      }
    } catch {
      notify.error("发布失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F6F7F8]">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#EDEFF1]">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-4 h-12">
          <button
            type="button"
            onClick={() => router.push("/square")}
            className="flex items-center gap-1 text-sm text-[#7C7C7C] hover:text-[#1A1A1B] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            取消
          </button>
          <h1 className="text-base font-semibold text-[#1A1A1B]">发布帖子</h1>
          <Button
            type="submit"
            form="square-post-form"
            loading={isSubmitting}
            disabled={imageLoadingCount > 0 || !isFormValid}
            className={cn(
              "hidden md:inline-flex px-3.5 py-1.5",
              !isFormValid || imageLoadingCount > 0
                ? "bg-[#EDEFF1] text-[#7C7C7C] hover:bg-[#EDEFF1] disabled:opacity-100"
                : "shadow-sm active:scale-[0.97]"
            )}
          >
            {!isSubmitting ? <Send className="h-3.5 w-3.5" /> : null}
            发布
          </Button>
        </div>
      </div>

      <div className={cn("mx-auto max-w-2xl px-4 pt-5", FIXED_SUBMIT_BAR_CONTENT_PADDING, "md:pb-24")}>
        <form id="square-post-form" onSubmit={handleSubmit} className="space-y-5">
          {/* 标题 */}
          <div className="rounded-xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入帖子标题"
              maxLength={MAX_TITLE_LENGTH}
              className="w-full text-lg font-semibold text-[#1A1A1B] placeholder:text-[#B0B0B0] focus:outline-none bg-transparent"
            />
            <div className="mt-2 flex justify-end border-t border-[#F6F7F8] pt-2">
              <p className={cn(
                "text-xs",
                title.length > MAX_TITLE_LENGTH * 0.9 ? "text-[#FF4500]" : "text-[#B0B0B0]"
              )}>
                {title.length}/{MAX_TITLE_LENGTH}
              </p>
            </div>
          </div>

          {/* 内容 */}
          <div className="rounded-xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="分享你的校园故事..."
              rows={8}
              maxLength={MAX_CONTENT_LENGTH}
              className="w-full text-sm leading-relaxed text-[#1A1A1B] placeholder:text-[#B0B0B0] focus:outline-none bg-transparent resize-none"
            />
            <div className="mt-2 flex justify-end border-t border-[#F6F7F8] pt-2">
              <p className={cn(
                "text-xs",
                content.length > MAX_CONTENT_LENGTH * 0.9 ? "text-[#FF4500]" : "text-[#B0B0B0]"
              )}>
                {content.length}/{MAX_CONTENT_LENGTH}
              </p>
            </div>
          </div>

          {/* 图片上传 */}
          <div className="rounded-xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
            <label className="mb-3 block text-sm font-medium text-[#1A1A1B]">
              图片（最多 {MAX_IMAGES} 张）
            </label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: Math.min(images.length + 1, MAX_IMAGES) }).map((_, i) => (
                <ImageUpload
                  key={i}
                  value={images[i] ?? ""}
                  onChange={handleImageChange(i)}
                  onUploading={(loading) =>
                    setImageLoadingCount((prev) => (loading ? prev + 1 : Math.max(0, prev - 1)))
                  }
                  uploadFn={uploadSquarePostImage}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-[#B0B0B0]">支持 JPG、PNG、WebP，单张 ≤2MB</p>
          </div>

          {/* 可见范围 */}
          <div className="rounded-xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
            <label className="mb-3 block text-sm font-medium text-[#1A1A1B]">
              可见范围
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setScope("INTRA")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all border",
                  scope === "INTRA"
                    ? "border-[#FF4500] bg-[#FFF5F0] text-[#FF4500] shadow-sm"
                    : "border-[#EDEFF1] bg-[#F6F7F8] text-[#7C7C7C] hover:border-[#D0D0D0]"
                )}
              >
                <School className="h-4 w-4" />
                校内
              </button>
              <button
                type="button"
                onClick={() => setScope("INTER")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all border",
                  scope === "INTER"
                    ? "border-[#FF4500] bg-[#FFF5F0] text-[#FF4500] shadow-sm"
                    : "border-[#EDEFF1] bg-[#F6F7F8] text-[#7C7C7C] hover:border-[#D0D0D0]"
                )}
              >
                <Globe className="h-4 w-4" />
                校际
              </button>
            </div>
            <p className="mt-2 text-xs text-[#B0B0B0]">
              {scope === "INTRA" ? "仅本校同学可见" : "所有学校的同学均可见"}
            </p>
          </div>

          {/* POI 挂载 */}
          <div className="rounded-xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
            <label className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#1A1A1B]">
              <MapPin className="h-4 w-4 text-[#FF4500]" />
              关联地点（可选）
            </label>

            {/* 已选 POI 标签 */}
            {selectedPOI && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-[#FFE5DD] px-3 py-1.5 text-sm font-medium text-[#FF4500]">
                <MapPin className="h-3.5 w-3.5" />
                {selectedPOI.name}
                <button
                  type="button"
                  onClick={() => setSelectedPOI(null)}
                  className="ml-1 rounded-full p-0.5 hover:bg-[#FF4500]/20 transition-colors"
                  aria-label="清除地点"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {schoolId ? (
              <>
                <POICombobox
                  schoolId={schoolId}
                  value={selectedPOI}
                  onChange={setSelectedPOI}
                  placeholder="搜索校园地点..."
                />
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 border-t border-[#EDEFF1]" />
                  <span className="text-xs text-[#B0B0B0]">或</span>
                  <div className="flex-1 border-t border-[#EDEFF1]" />
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/?pickPoi=1")}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-[#EDEFF1] bg-[#F6F7F8] py-3 text-sm font-medium text-[#7C7C7C] transition-all hover:border-[#FF4500]/40 hover:bg-[#FFF5F0] hover:text-[#FF4500] active:scale-[0.98]"
                >
                  <Map className="h-4 w-4" />
                  地图选点
                </button>
              </>
            ) : (
              <p className="text-sm text-[#B0B0B0]">未绑定学校，无法选择地点</p>
            )}
          </div>
        </form>
      </div>

      <FixedSubmitBar
        form="square-post-form"
        loading={isSubmitting}
        disabled={imageLoadingCount > 0 || !isFormValid}
        className="md:hidden"
        buttonClassName={
          !isFormValid || imageLoadingCount > 0
            ? "bg-[#EDEFF1] text-[#7C7C7C] hover:bg-[#EDEFF1] disabled:opacity-100"
            : undefined
        }
      >
        {!isSubmitting ? <Send className="h-4 w-4" /> : null}
        发布
      </FixedSubmitBar>
    </div>
  );
}

export default function SquarePostPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
          </div>
        }
      >
        <SquarePostEditor />
      </Suspense>
    </AuthGuard>
  );
}
