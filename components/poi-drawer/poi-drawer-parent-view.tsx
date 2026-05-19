"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Navigation, Map as MapIcon, CalendarDays, Package, Plus, ExternalLink, MessageCircle } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { openConfirm } from "@/components/ui/confirm-dialog";
import { analytics } from "@/lib/analytics";
import type { POIWithStatus } from "@/lib/geo/poi-utils";
import { formatRelativeTime } from "@/lib/core/utils";
import {
  CommentBlock,
  CommentTextarea,
} from "@/components/poi-drawer/poi-comment-block";
import { deleteComment, reportComment } from "@/lib/actions/comment";
import { ImageCarousel } from "@/components/poi-drawer/image-carousel";
import { LiveStatusSection } from "@/components/poi-drawer/live-status-section";
import { usePoiDrawerContext } from "@/components/poi-drawer/poi-drawer-context";

export function PoiDrawerParentViewContent({
  onViewInMapClick,
}: {
  onViewInMapClick?: () => void;
}) {
  const router = useRouter();
  const {
    displayPoi,
    poiWithChildren,
    userLocation,
    isInCooldown,
    isLoadingLiveStatuses,
    activeLiveStatuses,
    reportingStatusType,
    onReportStatus,
    activeActivities,
    setSelectedActivity,
    activeLostFound,
    setShowLostFoundForm,
    onSelectLostFoundItem,
    currentUser,
    comments,
    isLoadingComments,
    sortBy,
    setSortBy,
    totalCommentCount,
    newComment,
    setNewComment,
    replyingTo,
    setReplyingTo,
    commentInputRef,
    highlightedCommentId,
    setProfileModalUserId,
    onReplyClick,
    onLikeClick,
    onCommentSubmit,
    isSubmittingComment,
    isAuthenticated,
    fetchComments,
    showLostFoundExpiredPlaceholder,
    handleClose,
    setEndPoint,
    setStartPoint,
    startNavigation,
    selectSubPOI,
    setHighlightPoi,
    highlightTimeoutRef,
  } = usePoiDrawerContext();

  const parent = poiWithChildren ?? displayPoi;
  const parentImages = [
    ...(parent && "imageUrl" in parent && parent.imageUrl ? [parent.imageUrl] : []),
    ...(poiWithChildren?.children?.filter((c) => c.imageUrl).map((c) => c.imageUrl!) ?? []),
  ].filter(Boolean) as string[];
  const now = new Date();
  const ongoingActivities = activeActivities.filter(
    (a) => new Date(a.startAt) <= now && new Date(a.endAt) >= now
  );
  const upcomingActivities = activeActivities.filter((a) => new Date(a.startAt) > now);

  return (
    <div className="p-6">
      <div className="mb-6">
        <ImageCarousel images={parentImages} altPrefix={displayPoi.name} />
      </div>
      {ongoingActivities.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-orange-200 bg-orange-50/80 p-4">
          <h3 className="mb-3 text-sm font-semibold text-orange-800 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-orange-600" />
            🔥 正在进行
          </h3>
          <div className="space-y-4">
            {ongoingActivities.map((a) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedActivity(a)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedActivity(a)}
                className="cursor-pointer rounded-lg border border-orange-200 bg-white p-4 transition-colors hover:bg-orange-50/80"
              >
                <div className="font-semibold text-orange-900">{a.title}</div>
                {a.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-gray-700">{a.description}</p>
                )}
                {a.link && (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    了解更多
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mb-6">
        <div className="mb-4">
          <span className="text-sm font-medium text-gray-500">分类</span>
          <p className="mt-1 text-lg font-medium text-gray-800">{displayPoi.category}</p>
        </div>
        {displayPoi.description && (
          <div className="mb-4">
            <span className="text-sm font-medium text-gray-500">描述</span>
            <p className="mt-1 text-gray-700">{displayPoi.description}</p>
          </div>
        )}
      </div>
      {(poiWithChildren?.children?.length ?? 0) > 0 && displayPoi && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-[#1A1A1B]">具体位置 / 附属设施</h3>
          <div className="space-y-2">
            {poiWithChildren!.children!.map((child) => {
              const childAsPoi = { ...child, parentId: displayPoi.id, schoolId: displayPoi.schoolId, category: (child.category as POIWithStatus["category"]) ?? "其他" } as POIWithStatus;
              return (
                <div key={child.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
                  <span className="font-medium text-gray-800">{child.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => {
                        analytics.poi.navigateClick({ poi_id: child.id });
                        setEndPoint({ lng: child.lng, lat: child.lat, name: child.name });
                        if (userLocation) {
                          setStartPoint({ lng: userLocation[0], lat: userLocation[1], name: "我的位置" });
                        } else {
                          notify.show("未获取到当前位置，请在左上角导航面板中通过地图选点设置起点");
                        }
                        startNavigation();
                        handleClose();
                        notify.success("导航已开始");
                      }}
                      className="rounded-lg bg-[#FF4500] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      <Navigation className="mr-1 inline h-3.5 w-3.5" />
                      到这去
                    </button>
                    <button
                      onClick={() => {
                        analytics.poi.showInMapClick({ poi_id: child.id, is_sub_poi: true });
                        setHighlightPoi(child.id);
                        selectSubPOI(childAsPoi);
                        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
                        highlightTimeoutRef.current = setTimeout(() => setHighlightPoi(null), 5000);
                        onViewInMapClick?.();
                      }}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                      在地图中查看
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <LiveStatusSection
        isInCooldown={isInCooldown}
        isLoadingLiveStatuses={isLoadingLiveStatuses}
        activeLiveStatuses={activeLiveStatuses}
        reportingStatusType={reportingStatusType}
        onReportStatus={onReportStatus}
      />
      {upcomingActivities.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-[#1A1A1B] flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#FF4500]" />
            即将举行的活动
          </h3>
          <div className="space-y-3">
            {upcomingActivities.map((a) => {
              const start = new Date(a.startAt);
              const end = new Date(a.endAt);
              const timeStr = `${start.toLocaleString("zh-CN", { month: "2-digit", day: "numeric", hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedActivity(a)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedActivity(a)}
                  className="cursor-pointer rounded-xl border border-gray-200 bg-gray-50/80 p-4 transition-colors hover:bg-gray-100/80"
                >
                  <div className="font-semibold text-[#1A1A1B]">{a.title}</div>
                  <div className="mt-1 text-xs text-gray-500">{timeStr}</div>
                  {a.description && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{a.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#1A1A1B] flex items-center gap-2">
            <Package className="h-4 w-4 text-[#FF4500]" />
            失物招领
          </h3>
          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                notify.error("请先登录后再发布");
                return;
              }
              setShowLostFoundForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            发布
          </button>
        </div>
        {showLostFoundExpiredPlaceholder ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-600">该信息已过期</p>
            <p className="mt-1 text-xs text-slate-500">发布 24 小时后该信息已对他人不可见</p>
          </div>
        ) : activeLostFound.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-6 text-center text-sm text-gray-500">最近这里没有失物招领信息。</p>
        ) : (
          <div className="space-y-3">
            {activeLostFound.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectLostFoundItem?.(item)}
                onKeyDown={(e) => e.key === "Enter" && onSelectLostFoundItem?.(item)}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-50/80 p-4 transition-colors hover:bg-gray-100/80"
              >
                <p className="line-clamp-2 text-sm text-gray-700">{item.description}</p>
                {item.images.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {item.images.slice(0, 3).map((src, i) => (
                      <div key={i} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md">
                        <Image src={src} alt="" fill className="object-cover" unoptimized={src.startsWith("blob:")} sizes="64px" />
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">{formatRelativeTime(item.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 border-t border-[#EDEFF1] pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#1A1A1B] flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#FF4500]" />
            留言板
            <span className="text-xs font-normal text-[#7C7C7C]">（共 {totalCommentCount} 条讨论）</span>
          </h3>
        </div>
        <div className="mb-3 flex gap-4 border-b border-[#EDEFF1] pb-2">
          <button type="button" onClick={() => setSortBy("latest")} className={`text-sm font-medium transition-colors ${sortBy === "latest" ? "text-[#1A1A1B] font-bold" : "text-[#7C7C7C] hover:text-[#1A1A1B]"}`}>最新</button>
          <button type="button" onClick={() => setSortBy("popular")} className={`text-sm font-medium transition-colors ${sortBy === "popular" ? "text-[#1A1A1B] font-bold" : "text-[#7C7C7C] hover:text-[#1A1A1B]"}`}>最热</button>
        </div>
        <div className="mb-4 max-h-64 space-y-3 overflow-y-auto overflow-x-hidden no-scrollbar touch-pan-y pb-20">
          {isLoadingComments ? (
            <div className="flex justify-center py-4 text-sm text-[#7C7C7C]">正在加载留言...</div>
          ) : comments.length === 0 ? (
            <div className="rounded-lg bg-[#F6F7F8] px-3 py-2 text-center text-xs text-[#7C7C7C]">暂无留言，快来抢沙发吧～</div>
          ) : (
            comments.map((root) => (
              <CommentBlock
                key={root.id}
                root={root}
                currentUser={currentUser}
                isAuthenticated={isAuthenticated}
                highlightedCommentId={highlightedCommentId}
                onAvatarClick={(userId) => setProfileModalUserId(userId)}
                onReplyClick={onReplyClick}
                onLikeClick={onLikeClick}
                onDeleteComment={async (id) => {
                  openConfirm({
                    title: "删除留言",
                    description: "确定要删除吗？此操作不可恢复。",
                    variant: "danger",
                    confirmText: "删除",
                    elevation: "elevated",
                    onConfirm: async () => {
                      try {
                        const result = await deleteComment(id);
                        if (!result.success) throw new Error(result.error || "删除失败");
                        notify.success("已删除");
                        await fetchComments(sortBy);
                      } catch (e) {
                        notify.error(e instanceof Error ? e.message : "删除失败");
                        throw e;
                      }
                    },
                  });
                }}
                onReportComment={async (id) => {
                  try {
                    const result = await reportComment(id);
                    if (!result.success) throw new Error(result.error || "举报失败");
                    notify.success(result.message || "举报已收到");
                    if (result.isAutoHidden) await fetchComments(sortBy);
                  } catch (e) {
                    notify.error(e instanceof Error ? e.message : "举报失败");
                  }
                }}
              />
            ))
          )}
        </div>
        {isAuthenticated ? (
          <div className="space-y-2">
            {replyingTo && (
              <div className="flex items-center justify-between rounded-lg bg-[#F6F7F8] px-3 py-1.5 text-xs">
                <span className="text-[#1A1A1B]">回复 <span className="text-[#FF4500]">@{replyingTo.name}</span></span>
                <button onClick={() => setReplyingTo(null)} className="rounded p-1 text-[#7C7C7C] hover:bg-[#EDEFF1] hover:text-[#1A1A1B]" aria-label="取消回复">✕</button>
              </div>
            )}
            <CommentTextarea ref={commentInputRef} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder={replyingTo ? `回复 @${replyingTo.name}...` : "说点什么吧...（最多 500 字）"} />
            <div className="flex items-center justify-between text-xs text-[#7C7C7C]">
              <span>{newComment.length}/500</span>
              <button onClick={onCommentSubmit} disabled={isSubmittingComment} className="flex items-center gap-1 rounded-full bg-[#FF4500] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmittingComment ? "发送中..." : "发送"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#EDEFF1] bg-[#F6F7F8] px-3 py-2 text-xs text-[#1A1A1B] flex items-center justify-between gap-2">
            <span>登录后可以在此发表留言，与同学交流经验。</span>
            <button onClick={() => router.push("/login")} className="rounded-full bg-[#FF4500] px-3 py-1 text-xs font-medium text-white hover:opacity-90">去登录</button>
          </div>
        )}
      </div>
    </div>
  );
}
