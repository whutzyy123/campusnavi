"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Modal } from "@/components/ui/modal";
import { useAuthStore } from "@/store/use-auth-store";
import {
  createFeedback,
  getUserFeedbacks,
  getFeedbackById,
  type FeedbackItem,
} from "@/lib/feedback-actions";
import Image from "next/image";
import { Loader2, MessageSquare, Bug, X, Send, Info, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { uploadFeedbackImage } from "@/lib/upload-actions";
import { formatRelativeTime } from "@/lib/utils";

function getTypeLabel(type: string): string {
  return type === "FEEDBACK" ? "使用体验反馈" : "Bug 提交";
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "待处理";
    case "RESOLVED":
      return "已解决";
    case "REJECTED":
      return "已驳回";
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "RESOLVED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

const MAX_IMAGES = 3;
type FeedbackTab = "submit" | "records";

function FeedbackContent() {
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 10;

  const [activeTab, setActiveTab] = useState<FeedbackTab>(() =>
    (searchParams.get("tab") === "records" ? "records" : "submit") as FeedbackTab
  );

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchList = useCallback(async () => {
    if (!currentUser?.id) {
      setIsLoading(false);
      setItems([]);
      setPagination(null);
      return;
    }
    setIsLoading(true);
    try {
      const result = await getUserFeedbacks(currentUser.id, { page, limit: pageSize });
      if (result.success && result.data) {
        setItems(result.data.data);
        setPagination({
          total: result.data.total,
          pageCount: result.data.pageCount,
          currentPage: result.data.currentPage,
        });
      } else {
        setItems([]);
        setPagination(null);
        if (result.error) toast.error(result.error);
      }
    } catch (err) {
      console.error("[fetchList]", err);
      setItems([]);
      setPagination(null);
      toast.error("获取列表失败，请刷新重试");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 同步 URL 中的 tab 到状态（支持浏览器前进/后退）
  useEffect(() => {
    const tab = searchParams.get("tab");
    setActiveTab(tab === "records" ? "records" : "submit");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error("请填写标题和详情内容");
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
        toast.success("提交成功");
        setFormTitle("");
        setFormContent("");
        setFormImages([]);
        fetchList();
        setActiveTab("records");
        router.replace(`${pathname}?tab=records&page=1`);
      } else {
        toast.error(result.error || "提交失败");
      }
    } catch {
      toast.error("提交失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailItem(null);
    setIsLoadingDetail(true);
    try {
      const result = await getFeedbackById(
        id,
        currentUser?.id ?? "",
        currentUser?.role === "SUPER_ADMIN"
      );
      if (result.success && result.data) {
        setDetailItem(result.data);
      } else {
        toast.error(result.error || "获取详情失败");
        setDetailId(null);
      }
    } catch {
      toast.error("获取详情失败");
      setDetailId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetailItem(null);
  };

  const handleTabChange = (tab: FeedbackTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "records") {
      params.set("tab", "records");
      if (!params.get("page")) params.set("page", "1");
    } else {
      params.delete("tab");
      params.delete("page");
    }
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      <h1 className="mb-2 text-2xl font-bold text-[#1A1A1B]">信息反馈 / Bug 提交</h1>
      <p className="mb-6 text-sm text-[#7C7C7C]">提交使用体验反馈或 Bug 报告</p>

      {/* 选项卡导航 */}
      <div className="mb-6 border-b border-[#EDEFF1]">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => handleTabChange("submit")}
            className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              activeTab === "submit"
                ? "border-[#FF4500] text-[#FF4500]"
                : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
            }`}
          >
            <Send className="h-4 w-4" />
            提交反馈
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("records")}
            className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              activeTab === "records"
                ? "border-[#FF4500] text-[#FF4500]"
                : "border-transparent text-[#7C7C7C] hover:text-[#1A1A1B]"
            }`}
          >
            <FileText className="h-4 w-4" />
            我的提交记录
          </button>
        </div>
      </div>

      {/* 提交表单 */}
      {activeTab === "submit" && (
      <div className="rounded-lg border border-[#EDEFF1] bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#7C7C7C]">类型</label>
            <div className="flex gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="type"
                  value="FEEDBACK"
                  checked={formType === "FEEDBACK"}
                  onChange={() => setFormType("FEEDBACK")}
                  className="h-4 w-4 border-gray-300 text-[#FF4500] focus:ring-[#FF4500]"
                />
                <MessageSquare className="h-4 w-4" />
                <span>使用体验反馈</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="type"
                  value="BUG"
                  checked={formType === "BUG"}
                  onChange={() => setFormType("BUG")}
                  className="h-4 w-4 border-gray-300 text-[#FF4500] focus:ring-[#FF4500]"
                />
                <Bug className="h-4 w-4" />
                <span>Bug 提交</span>
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="feedback-title" className="mb-2 block text-sm font-medium text-[#7C7C7C]">
              标题
            </label>
            <input
              id="feedback-title"
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="简要描述问题或反馈"
              maxLength={200}
              className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
            <p className="mt-1 text-xs text-[#7C7C7C]">{formTitle.length}/200</p>
          </div>
          <div>
            <label htmlFor="feedback-content" className="mb-2 block text-sm font-medium text-[#7C7C7C]">
              详情内容
            </label>
            <textarea
              id="feedback-content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="请详细描述您遇到的问题或使用体验建议..."
              rows={5}
              maxLength={2000}
              className="w-full rounded-lg border border-[#EDEFF1] px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
            <p className="mt-1 text-xs text-[#7C7C7C]">{formContent.length}/2000</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[#7C7C7C]">
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
            <p className="mt-1 text-xs text-[#7C7C7C]">支持 JPG、PNG、WebP，单张 ≤2MB</p>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || imageLoadingCount > 0 || !formTitle.trim() || !formContent.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            提交
          </button>
        </form>
      </div>
      )}

      {/* 我的提交记录 */}
      {activeTab === "records" && (
      <div>
        {isLoading ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Info}
            title="暂无提交记录"
            description="提交反馈或 Bug 后，这里会展示您的记录。"
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#EDEFF1] bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead responsiveHide="sm">状态</TableHead>
                    <TableHead responsiveHide="lg">提交时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="text-sm text-[#7C7C7C]">
                          {getTypeLabel(item.type)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-sm font-medium text-[#1A1A1B]">
                          {item.title}
                        </div>
                      </TableCell>
                      <TableCell responsiveHide="sm">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(item.status)}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </TableCell>
                      <TableCell responsiveHide="lg" className="text-xs text-[#7C7C7C]">
                        {formatRelativeTime(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(item.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEFF1] px-3 py-1.5 text-xs font-medium text-[#1A1A1B] transition-colors hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]"
                        >
                          查看详情
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {pagination && pagination.pageCount > 1 && (
              <div className="mt-4">
                <PaginationControls
                  total={pagination.total}
                  pageCount={pagination.pageCount}
                  currentPage={pagination.currentPage}
                  limit={pageSize}
                />
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* 详情弹窗 */}
      <Modal
        isOpen={!!detailId}
        onClose={closeDetail}
        containerClassName="max-w-lg"
      >
        <div className="flex max-h-[min(85vh,calc(100vh-40px)] flex-col overflow-hidden rounded-xl bg-white">
          <div className="modal-header flex items-center justify-between px-6 py-4">
            <h3 className="text-lg font-semibold text-[#1A1A1B]">反馈详情</h3>
            <button
              type="button"
              onClick={closeDetail}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="modal-body overflow-y-auto px-6 py-4">
            {isLoadingDetail ? (
              <div className="flex min-h-[120px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
              </div>
            ) : detailItem ? (
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-[#7C7C7C]">类型</span>
                  <p className="mt-1 text-sm font-medium">{getTypeLabel(detailItem.type)}</p>
                </div>
                <div>
                  <span className="text-xs text-[#7C7C7C]">标题</span>
                  <p className="mt-1 text-sm font-medium">{detailItem.title}</p>
                </div>
                <div>
                  <span className="text-xs text-[#7C7C7C]">状态</span>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(detailItem.status)}`}
                    >
                      {getStatusLabel(detailItem.status)}
                    </span>
                  </p>
                </div>
                {(detailItem.images?.length ?? 0) > 0 && (
                  <div>
                    <span className="text-xs text-[#7C7C7C]">图片</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {detailItem.images.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[#EDEFF1]"
                        >
                          <Image
                            src={url}
                            alt={`图片 ${i + 1}`}
                            fill
                            className="object-cover"
                            unoptimized={url.startsWith("blob:")}
                            sizes="96px"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-xs text-[#7C7C7C]">详情内容</span>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#1A1A1B]">
                    {detailItem.content}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-[#7C7C7C]">提交时间</span>
                  <p className="mt-1 text-sm">
                    {new Date(detailItem.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>
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
        <FeedbackContent />
      </Suspense>
    </AuthGuard>
  );
}
