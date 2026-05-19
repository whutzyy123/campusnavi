"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { useAuthStore } from "@/store/use-auth-store";
import { createFeedback } from "@/lib/actions/feedback";
import { Loader2, MessageSquare, Bug, Send, FileText, ChevronRight, Heart } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { ImageUpload } from "@/components/shared/image-upload";
import { uploadFeedbackImage } from "@/lib/actions/upload";
import { cn } from "@/lib/core/utils";
import { FixedSubmitBar, FIXED_SUBMIT_BAR_CONTENT_PADDING } from "@/components/shared/fixed-submit-bar";

function getTypeLabel(type: string): string {
  return type === "FEEDBACK" ? "使用体验反馈" : "Bug 提交";
}

const MAX_IMAGES = 3;

function FeedbackSubmitPage() {
  const { currentUser } = useAuthStore();
  const router = useRouter();

  const [formType, setFormType] = useState<"FEEDBACK" | "BUG">("FEEDBACK");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [imageLoadingCount, setImageLoadingCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = (index: number) => (url: string) => {
    if (url) {
      setFormImages((prev) => {
        const next = [...prev];
        next[index] = url;
        return next.slice(0, MAX_IMAGES);
      });
    } else {
      setFormImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      notify.error("请填写标题和详情内容");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createFeedback({
        type: formType,
        title: formTitle.trim(),
        content: formContent.trim(),
        images: formImages,
      });
      if (result.success) {
        notify.success("提交成功");
        setFormTitle("");
        setFormContent("");
        setFormImages([]);
        router.push("/feedback/records");
      } else {
        notify.error(result.error || "提交失败");
      }
    } catch {
      notify.error("提交失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F6F7F8]">
      {/* 顶部渐变装饰条 */}
      <div className="h-[3px] bg-gradient-to-r from-[#FF4500] to-[#FF6B3D]" />

      {/* 页面头部 */}
      <div className="bg-white border-b border-[#EDEFF1]">
        <div className="mx-auto max-w-2xl px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FF6B3D] flex items-center justify-center shadow-md shadow-[#FF4500]/20">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1B]">反馈中心</h1>
            <p className="text-sm text-[#7C7C7C] mt-0.5">你的声音，我们认真倾听</p>
          </div>
        </div>
      </div>

      <div className={cn("mx-auto max-w-2xl px-4 pt-6", FIXED_SUBMIT_BAR_CONTENT_PADDING)}>
        {/* 类型切换 — Segmented Control */}
        <div className="mb-5 flex rounded-xl border border-[#EDEFF1] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setFormType("FEEDBACK")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
            formType === "FEEDBACK"
              ? "bg-[#FF4500] text-white shadow-sm"
              : "text-[#7C7C7C] hover:bg-[#F6F7F8]"
          )}
        >
          <div className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            formType === "FEEDBACK" ? "bg-white/20" : "bg-gray-100"
          )}>
            <MessageSquare className="h-3.5 w-3.5" />
          </div>
          体验反馈
        </button>
        <button
          type="button"
          onClick={() => setFormType("BUG")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
            formType === "BUG"
              ? "bg-[#FF4500] text-white shadow-sm"
              : "text-[#7C7C7C] hover:bg-[#F6F7F8]"
          )}
        >
          <div className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            formType === "BUG" ? "bg-white/20" : "bg-gray-100"
          )}>
            <Bug className="h-3.5 w-3.5" />
          </div>
          Bug 报告
        </button>
      </div>

      {/* 提交表单 */}
      <div className="rounded-xl border border-[#EDEFF1] border-t-[3px] border-t-[#FF4500] bg-white p-5 shadow-sm">
        <form id="feedback-form" onSubmit={handleSubmit} className="space-y-5">
          {/* 标题 */}
          <div>
            <label htmlFor="feedback-title" className="mb-2 block text-sm font-medium text-[#1A1A1B]">
              标题 <span className="text-[#FF4500]">*</span>
            </label>
            <input
              id="feedback-title"
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="简要描述问题或反馈"
              maxLength={200}
              className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2.5 text-sm text-[#1A1A1B] placeholder:text-[#7C7C7C] focus:border-[#FF4500] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 transition-colors"
            />
            <div className="mt-1.5 flex justify-end">
              <p className="text-xs text-[#7C7C7C]">{formTitle.length}/200</p>
            </div>
          </div>

          {/* 详情内容 */}
          <div>
            <label htmlFor="feedback-content" className="mb-2 block text-sm font-medium text-[#1A1A1B]">
              详情内容 <span className="text-[#FF4500]">*</span>
            </label>
            <textarea
              id="feedback-content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="请详细描述您遇到的问题或使用体验建议..."
              rows={5}
              maxLength={2000}
              className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2.5 text-sm text-[#1A1A1B] placeholder:text-[#7C7C7C] focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 resize-none transition-colors"
            />
            <div className="mt-1.5 flex justify-end">
              <p className="text-xs text-[#7C7C7C]">{formContent.length}/2000</p>
            </div>
          </div>

          {/* 图片 — 视觉分组 */}
          <div className="border-t border-dashed border-[#EDEFF1] pt-5">
            <label className="mb-2 block text-sm font-medium text-[#1A1A1B]">
              图片（最多 {MAX_IMAGES} 张）
            </label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: Math.min(formImages.length + 1, MAX_IMAGES) }).map((_, i) => (
                <ImageUpload
                  key={i}
                  value={formImages[i] ?? ""}
                  onChange={handleImageChange(i)}
                  onUploading={(loading) =>
                    setImageLoadingCount((prev) => (loading ? prev + 1 : Math.max(0, prev - 1)))
                  }
                  uploadFn={uploadFeedbackImage}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-[#7C7C7C]">支持 JPG、PNG、WebP，单张 ≤2MB</p>
          </div>
        </form>
      </div>

      <FixedSubmitBar
        form="feedback-form"
        loading={isSubmitting}
        disabled={imageLoadingCount > 0 || !formTitle.trim() || !formContent.trim()}
      >
        {!isSubmitting ? <Send className="h-4 w-4" /> : null}
        提交反馈
      </FixedSubmitBar>

      {/* 我的反馈记录链接 */}
      <Link
        href="/feedback/records"
        className="mt-4 flex w-full items-center gap-3 rounded-xl border border-[#EDEFF1] border-l-4 border-l-[#FF4500] bg-white px-4 py-3.5 text-sm font-medium text-[#1A1A1B] transition-all hover:shadow-sm hover:border-l-[#FF6B3D] hover:bg-[#FFF7F5]"
      >
        <FileText className="h-5 w-5 text-[#FF4500]" />
        <span className="flex-1">查看我的反馈记录</span>
        <ChevronRight className="h-4 w-4 text-[#7C7C7C]" />
      </Link>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
          </div>
        }
      >
        <FeedbackSubmitPage />
      </Suspense>
    </AuthGuard>
  );
}
