"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader, PageHeaderLayout } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { PageEmpty, PageError, PageLoading } from "@/components/ui/page-state";
import { useAuthStore } from "@/store/use-auth-store";
import {
  getUserFeedbacks,
  getFeedbackById,
  type FeedbackItem,
} from "@/lib/actions/feedback";
import {
  Loader2,
  MessageSquare,
  Bug,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Calendar,
  Reply,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { formatRelativeTime, cn } from "@/lib/core/utils";

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
      return "bg-[#FFF7F5] text-[#FF4500]";
    case "RESOLVED":
      return "bg-green-50 text-green-700";
    case "REJECTED":
      return "bg-[#F6F7F8] text-[#7C7C7C]";
    default:
      return "bg-[#F6F7F8] text-[#7C7C7C]";
  }
}

function getTypeBgClass(type: string): string {
  return type === "FEEDBACK"
    ? "bg-blue-50 text-blue-600"
    : "bg-red-50 text-red-600";
}

function getTypeIcon(type: string) {
  return type === "FEEDBACK" ? MessageSquare : Bug;
}

const pageSize = 10;

function FeedbackRecordsContent() {
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchList = useCallback(async () => {
    if (!currentUser?.id) {
      setIsLoading(false);
      setItems([]);
      setPagination(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
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
        setError(result.error ?? "获取列表失败");
      }
    } catch (err) {
      console.error("[fetchList]", err);
      setItems([]);
      setPagination(null);
      setError("获取列表失败，请刷新重试");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailItem(null);
      return;
    }
    setExpandedId(id);
    setIsLoadingDetail(true);
    try {
      const result = await getFeedbackById(id, currentUser?.id ?? "", false);
      if (result.success && result.data) {
        setDetailItem(result.data);
      } else {
        notify.error(result.error || "获取详情失败");
        setExpandedId(null);
      }
    } catch {
      notify.error("获取详情失败");
      setExpandedId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setExpandedId(null);
    setDetailItem(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <PageHeaderLayout
      header={
        <PageHeader
          title="我的反馈"
          backHref="/feedback"
          rightSlot={
            pagination ? (
              <div className="rounded-full bg-[#F6F7F8] px-3 py-1 text-xs font-medium text-[#7C7C7C]">
                共 {pagination.total} 条
              </div>
            ) : undefined
          }
        />
      }
    >
      {/* 列表 */}
      {error ? (
        <PageError description={error} onRetry={fetchList} />
      ) : isLoading ? (
        <PageLoading className="flex min-h-[120px] items-center justify-center" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#EDEFF1] bg-white p-6">
          <PageEmpty
            icon={FileText}
            title="暂无提交记录"
            description="提交反馈或 Bug 后，这里会展示您的记录。"
            action={{ label: "去提交反馈", onClick: () => router.push("/feedback") }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const TypeIcon = getTypeIcon(item.type);

            const statusBorderClass =
              item.status === "PENDING"
                ? "border-l-[#FF4500]"
                : item.status === "RESOLVED"
                ? "border-l-green-500"
                : "border-l-gray-300";

            return (
              <div
                key={item.id}
                className={cn(
                  "overflow-hidden rounded-2xl border border-[#EDEFF1] border-l-[3px] bg-white shadow-sm transition-shadow hover:shadow-md",
                  statusBorderClass
                )}
              >
                {/* 卡片头部 — 可点击展开 */}
                <button
                  type="button"
                  onClick={() => toggleExpand(item.id)}
                  className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-[#F6F7F8]/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", getTypeBgClass(item.type))}
                      >
                        <TypeIcon className="h-3 w-3" />
                        {getTypeLabel(item.type)}
                      </span>
                      <span
                        className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", getStatusClass(item.status))}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#1A1A1B] line-clamp-1">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[#7C7C7C]">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(item.createdAt)}
                    </div>
                  </div>
                  <div className={cn(
                    "ml-3 shrink-0 flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                    isExpanded ? "bg-[#FF4500] text-white" : "bg-[#F6F7F8] text-[#7C7C7C]"
                  )}>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="border-t border-[#EDEFF1]">
                    {isLoadingDetail ? (
                      <div className="flex min-h-[80px] items-center justify-center bg-[#F6F7F8]/50">
                        <Loader2 className="h-6 w-6 animate-spin text-[#FF4500]" />
                      </div>
                    ) : detailItem ? (
                      <>
                        {/* 反馈内容 */}
                        <div className="bg-[#F6F7F8] px-4 py-3">
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#1A1A1B]">
                            {detailItem.content}
                          </p>
                        </div>

                        {/* 图片 */}
                        {(detailItem.images?.length ?? 0) > 0 && (
                          <div className="border-t border-[#EDEFF1] px-4 py-3">
                            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#7C7C7C]">
                              <ImageIcon className="h-3.5 w-3.5" />
                              附件图片
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {detailItem.images.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[#EDEFF1] transition-transform hover:scale-105"
                                >
                                  <Image
                                    src={url}
                                    alt={`图片 ${i + 1}`}
                                    fill
                                    className="object-cover"
                                    unoptimized={url.startsWith("blob:")}
                                    sizes="80px"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 提交时间 */}
                        <div className="border-t border-[#EDEFF1] px-4 py-2.5">
                          <div className="flex items-center gap-1.5 text-xs text-[#7C7C7C]">
                            <Calendar className="h-3 w-3" />
                            提交于 {new Date(detailItem.createdAt).toLocaleString("zh-CN")}
                          </div>
                        </div>

                        {/* 平台回复 */}
                        {detailItem.reply && (
                          <div className="border-t border-[#FFE5DD] border-l-[3px] border-l-[#FF4500] bg-[#FFF7F5] px-4 py-3">
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#FF4500]">
                              <Reply className="h-3.5 w-3.5" />
                              平台回复
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#1A1A1B]">
                              {detailItem.reply}
                            </p>
                            {detailItem.repliedAt && (
                              <p className="mt-2 text-xs text-[#7C7C7C]">
                                {new Date(detailItem.repliedAt).toLocaleString("zh-CN")}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {/* 分页 */}
          {pagination && pagination.pageCount > 1 && (
            <div className="mt-6 border-t border-[#EDEFF1] pt-4">
              <PaginationControls
                total={pagination.total}
                pageCount={pagination.pageCount}
                currentPage={pagination.currentPage}
                limit={pageSize}
              />
            </div>
          )}
        </div>
      )}
    </PageHeaderLayout>
  );
}

export default function FeedbackRecordsPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense fallback={<PageLoading className="flex min-h-[50vh] items-center justify-center" />}>
        <FeedbackRecordsContent />
      </Suspense>
    </AuthGuard>
  );
}
