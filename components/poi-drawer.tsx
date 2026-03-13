/**
 * POI 详情抽屉组件
 * 用于显示 POI 信息和实时状态上报
 * 支持移动端手势关闭和动画
 */

"use client";

import { useState, useEffect, useMemo, memo, useRef, useCallback, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Flag, Navigation, MessageCircle, Heart, Map as MapIcon, MapPin, ImageIcon, ExternalLink, CalendarDays, Package, Plus, ArrowLeft, Loader2 } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { useAuthStore } from "@/store/use-auth-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSchoolStore } from "@/store/use-school-store";
import type { POIWithStatus } from "@/lib/poi-utils";
import { getCategoryIcon } from "@/lib/poi-utils";
import { reportLiveStatus, getActiveStatusesByPoi } from "@/lib/status-actions";
import { toggleFavorite, checkIsFavorite } from "@/lib/favorite-actions";
import { getActiveActivitiesByPoi } from "@/lib/activity-actions";
import { getActiveLostFoundByPoi, checkLostFoundEvent } from "@/lib/lost-found-actions";
import { LostFoundForm } from "@/components/lost-found-form";
import { UserProfileModal } from "@/components/shared/user-profile-modal";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { toggleCommentLike, deleteComment, reportComment, getPOIComments, createComment } from "@/lib/comment-actions";
import { getPOIDetail } from "@/lib/poi-actions";
import toast from "react-hot-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/** 失物招领项（与 getActiveLostFoundByPoi 返回结构一致） */
export interface LostFoundItemForSelect {
  id: string;
  description: string;
  images: string[];
  contactInfo: string | null;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null };
}

interface POIDrawerProps {
  poi: POIWithStatus | null;
  schoolId: string;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: () => void;
  userLocation?: [number, number]; // 用户当前位置
  /** 从 URL 传入的 commentId，用于滚动并高亮该留言 */
  highlightCommentId?: string;
  /** 从 URL 传入的 lostFoundId，用于 deep link；若已过期则显示占位提示 */
  highlightLostFoundId?: string;
  /** 点击失物招领卡片时调用，用于打开详情弹窗（由父级管理） */
  onSelectLostFoundItem?: (item: LostFoundItemForSelect) => void;
  /** 父级刷新失物招领列表时递增，触发 drawer 内重新拉取 */
  lostFoundListRefreshTrigger?: number;
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  reportCount: number;
  isHidden: boolean;
  parentId?: string | null;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    email?: string | null;
  };
  parent?: {
    id: string;
    user: {
      id: string;
      nickname: string | null;
    };
  } | null;
  replies?: CommentItem[]; // 树形结构中的子回复
}

/**
 * 将平铺的留言数组转换为树形结构
 * @param flatComments 平铺的留言数组
 * @returns 树形结构的留言数组（只包含顶级留言，子回复在 replies 中）
 */
function buildCommentTree(flatComments: CommentItem[]): CommentItem[] {
  // 创建 ID 到留言的映射
  const commentMap = new Map<string, CommentItem>();
  const rootComments: CommentItem[] = [];

  // 第一遍：创建所有留言的副本，初始化 replies 数组
  flatComments.forEach((comment) => {
    commentMap.set(comment.id, {
      ...comment,
      replies: [],
    });
  });

  // 第二遍：构建树形结构
  flatComments.forEach((comment) => {
    const node = commentMap.get(comment.id)!;
    
    if (!comment.parentId) {
      // 顶级留言
      rootComments.push(node);
    } else {
      // 子回复：添加到父留言的 replies 中
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        if (!parent.replies) {
          parent.replies = [];
        }
        parent.replies.push(node);
      } else {
        // 父留言不存在（可能已被删除），作为顶级留言处理
        rootComments.push(node);
      }
    }
  });

  // 顶级留言顺序由 API 返回顺序决定（支持 latest/popular），不再在此重排
  // 递归排序所有子回复
  const sortReplies = (comments: CommentItem[]) => {
    comments.forEach((comment) => {
      if (comment.replies && comment.replies.length > 0) {
        comment.replies.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        sortReplies(comment.replies);
      }
    });
  };

  sortReplies(rootComments);

  return rootComments;
}

/** 在树形结构中查找指定留言 */
function findCommentInTree(comments: CommentItem[], commentId: string): CommentItem | null {
  for (const c of comments) {
    if (c.id === commentId) return c;
    if (c.replies?.length) {
      const found = findCommentInTree(c.replies, commentId);
      if (found) return found;
    }
  }
  return null;
}

/** 在树形结构中更新指定留言（用于点赞乐观更新） */
function updateCommentInTree(
  comments: CommentItem[],
  commentId: string,
  updater: (c: CommentItem) => CommentItem
): CommentItem[] {
  return comments.map((c) => {
    if (c.id === commentId) return updater(c);
    if (c.replies?.length) {
      return { ...c, replies: updateCommentInTree(c.replies, commentId, updater) };
    }
    return c;
  });
}

/** 将嵌套回复展平为单层数组（按时间正序） */
function flattenReplies(comments: CommentItem[]): CommentItem[] {
  const result: CommentItem[] = [];
  const visit = (list: CommentItem[]) => {
    for (const c of list) {
      result.push(c);
      if (c.replies && c.replies.length > 0) {
        visit(c.replies);
      }
    }
  };
  visit(comments);
  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** 将时间戳格式化为相对时间（如 "10分钟前"） */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

/** 实时状态徽章展示配置（含 emoji 用于去重展示） */
const LIVE_STATUS_BADGE_CONFIG: Record<string, { label: string; emoji: string; className: string }> = {
  EMPTY: { label: "空闲畅通", emoji: "🟢", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  BUSY: { label: "略显拥挤", emoji: "🟡", className: "border-amber-200 bg-amber-50 text-amber-800" },
  CROWDED: { label: "爆满排队", emoji: "🔴", className: "border-red-200 bg-red-50 text-red-800" },
  CONSTRUCTION: { label: "施工绕行", emoji: "🚧", className: "border-orange-200 bg-orange-50 text-orange-800" },
  CLOSED: { label: "暂停营业/关闭", emoji: "🔒", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

const REPORT_COOLDOWN_MS = 60 * 1000; // 60 秒
const OPTIMISTIC_ID_PREFIX = "optimistic-";

function getStatusBadgeConfig(statusType: string) {
  return LIVE_STATUS_BADGE_CONFIG[statusType] ?? {
    label: statusType,
    emoji: "•",
    className: "border-gray-200 bg-gray-50 text-gray-700",
  };
}

/** 将 status 列表按 statusType 分组，返回 { statusType, count, latestCreatedAt }[] */
function groupStatusesByType(
  statuses: Array<{ id: string; statusType: string; createdAt: string }>
): Array<{ statusType: string; count: number; latestCreatedAt: string }> {
  const groups = new Map<string, { count: number; latestCreatedAt: string }>();
  for (const s of statuses) {
    const existing = groups.get(s.statusType);
    const createdAt = s.createdAt;
    if (!existing) {
      groups.set(s.statusType, { count: 1, latestCreatedAt: createdAt });
    } else {
      existing.count += 1;
      if (new Date(createdAt) > new Date(existing.latestCreatedAt)) {
        existing.latestCreatedAt = createdAt;
      }
    }
  }
  return Array.from(groups.entries()).map(([statusType, { count, latestCreatedAt }]) => ({
    statusType,
    count,
    latestCreatedAt,
  }));
}

/** Ephemeral 上报按钮配置：Group 1 人流，Group 2 事件 */
const LIVE_STATUS_BUTTONS = {
  traffic: [
    { id: "EMPTY", label: "空闲畅通", emoji: "🟢", className: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
    { id: "BUSY", label: "略显拥挤", emoji: "🟡", className: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" },
    { id: "CROWDED", label: "爆满排队", emoji: "🔴", className: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" },
  ],
  events: [
    { id: "CONSTRUCTION", label: "施工绕行", emoji: "🚧", className: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100" },
    { id: "CLOSED", label: "暂停营业/关闭", emoji: "🔒", className: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200" },
  ],
} as const;

/** 子 POI 结构（来自 getPOIDetail / POI 详情） */
interface SubPOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  description?: string | null;
  imageUrl?: string | null;
}

/** PoiDrawerContent 所需 props（从 POIDrawer 传入，无内部状态） */
interface PoiDrawerContentProps {
  displayPoi: POIWithStatus;
  isSubPoiView: boolean;
  poiWithChildren: (POIWithStatus & { children?: SubPOI[] }) | null;
  CategoryIcon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
  selectSubPOI: (poi: POIWithStatus | null) => void;
  userLocation?: [number, number];
  isInCooldown: boolean;
  isLoadingLiveStatuses: boolean;
  activeLiveStatuses: Array<{ id: string; statusType: string; description: string | null; upvotes: number; createdAt: string }>;
  reportingStatusType: string | null;
  onReportStatus: (statusType: string) => void;
  activeActivities: Array<{ id: string; title: string; description: string; link: string | null; startAt: string; endAt: string }>;
  selectedActivity: { id: string; title: string; description: string; link: string | null; startAt: string; endAt: string } | null;
  setSelectedActivity: (a: { id: string; title: string; description: string; link: string | null; startAt: string; endAt: string } | null) => void;
  activeLostFound: Array<{
    id: string;
    description: string;
    images: string[];
    contactInfo: string | null;
    expiresAt: string;
    createdAt: string;
    user: { id: string; nickname: string | null };
  }>;
  setShowLostFoundForm: (v: boolean) => void;
  onSelectLostFoundItem?: (item: LostFoundItemForSelect) => void;
  setEndPoint: (p: { lng: number; lat: number; name: string }) => void;
  setStartPoint: (p: { lng: number; lat: number; name: string }) => void;
  startNavigation: () => void;
  openNavigationPanel: () => void;
  setHighlightPoi: (id: string | null) => void;
  highlightTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** 移动端：点击「在地图中查看」后收起至半展开，便于查看地图 */
  onViewInMapClick?: () => void;
  setShowReportModal: (v: boolean) => void;
  comments: CommentItem[];
  isLoadingComments: boolean;
  sortBy: "latest" | "popular";
  setSortBy: (v: "latest" | "popular") => void;
  totalCommentCount: number;
  newComment: string;
  setNewComment: (v: string) => void;
  replyingTo: { id: string; name: string } | null;
  setReplyingTo: (v: { id: string; name: string } | null) => void;
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  highlightedCommentId: string | null;
  setProfileModalUserId: (v: string | null) => void;
  onReplyClick: (comment: CommentItem) => void;
  onLikeClick: (commentId: string) => void | Promise<void>;
  onCommentSubmit: () => void;
  isSubmittingComment: boolean;
  isAuthenticated: boolean;
  currentUser: { id: string; role?: string } | null;
  fetchComments: (sort?: "latest" | "popular") => void;
  schoolId: string;
  isFavorited: boolean;
  isTogglingFavorite: boolean;
  onToggleFavorite: () => void;
  getActiveLostFoundByPoi: (poiId: string, schoolId: string) => Promise<{ success: boolean; data?: unknown[] }>;
  setActiveLostFound: React.Dispatch<React.SetStateAction<Array<{
    id: string;
    description: string;
    images: string[];
    contactInfo: string | null;
    expiresAt: string;
    createdAt: string;
    user: { id: string; nickname: string | null };
  }>>>;
  showLostFoundExpiredPlaceholder: boolean;
}

function PoiDrawerContent({
  displayPoi,
  isSubPoiView,
  poiWithChildren,
  CategoryIcon,
  onClose,
  selectSubPOI,
  userLocation,
  isInCooldown,
  isLoadingLiveStatuses,
  activeLiveStatuses,
  reportingStatusType,
  onReportStatus,
  activeActivities,
  selectedActivity,
  setSelectedActivity,
  activeLostFound,
  setShowLostFoundForm,
  onSelectLostFoundItem,
  setEndPoint,
  setStartPoint,
  startNavigation,
  openNavigationPanel,
  setHighlightPoi,
  highlightTimeoutRef,
  onViewInMapClick,
  setShowReportModal,
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
  currentUser,
  fetchComments,
  schoolId,
  isFavorited,
  isTogglingFavorite,
  onToggleFavorite,
  getActiveLostFoundByPoi,
  setActiveLostFound,
  showLostFoundExpiredPlaceholder,
}: PoiDrawerContentProps) {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex-shrink-0 border-b border-[#EDEFF1] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubPoiView && (
              <button
                onClick={() => selectSubPOI(null)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                aria-label="返回父 POI"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
            )}
            <CategoryIcon className="h-6 w-6 text-[#FF4500]" />
            <h2 className="text-xl font-bold text-[#1A1A1B]">{displayPoi.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={onToggleFavorite}
                disabled={isTogglingFavorite}
                className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                  isFavorited
                    ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                    : "border-[#EDEFF1] bg-white text-[#7C7C7C] hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-label={isFavorited ? "取消收藏" : "收藏"}
              >
                {isTogglingFavorite ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart className={`h-4 w-4 ${isFavorited ? "fill-current" : ""}`} />
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#7C7C7C] hover:text-[#1A1A1B]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 可滚动内容区（data-vaul-no-drag 防止移动端 Bottom Sheet 滚动时误触拖拽关闭） */}
      <div className="flex-1 overflow-y-auto scrollbar-theme scrollbar-gutter-stable min-h-0" data-vaul-no-drag>
        {isSubPoiView ? (
          <PoiDrawerSubPoiView
            displayPoi={displayPoi}
            poiWithChildren={poiWithChildren}
            isInCooldown={isInCooldown}
            isLoadingLiveStatuses={isLoadingLiveStatuses}
            activeLiveStatuses={activeLiveStatuses}
            reportingStatusType={reportingStatusType}
            onReportStatus={onReportStatus}
          />
        ) : (
          <PoiDrawerParentViewContent
            displayPoi={displayPoi}
            poiWithChildren={poiWithChildren}
            userLocation={userLocation}
            isInCooldown={isInCooldown}
            isLoadingLiveStatuses={isLoadingLiveStatuses}
            activeLiveStatuses={activeLiveStatuses}
            reportingStatusType={reportingStatusType}
            onReportStatus={onReportStatus}
            activeActivities={activeActivities}
            setSelectedActivity={setSelectedActivity}
            activeLostFound={activeLostFound}
            setShowLostFoundForm={setShowLostFoundForm}
            onSelectLostFoundItem={onSelectLostFoundItem}
            currentUser={currentUser}
            comments={comments}
            isLoadingComments={isLoadingComments}
            sortBy={sortBy}
            setSortBy={setSortBy}
            totalCommentCount={totalCommentCount}
            newComment={newComment}
            setNewComment={setNewComment}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            commentInputRef={commentInputRef}
            highlightedCommentId={highlightedCommentId}
            setProfileModalUserId={setProfileModalUserId}
            onReplyClick={onReplyClick}
            onLikeClick={onLikeClick}
            onCommentSubmit={onCommentSubmit}
            isSubmittingComment={isSubmittingComment}
            isAuthenticated={isAuthenticated}
            fetchComments={fetchComments}
            schoolId={schoolId}
            getActiveLostFoundByPoi={getActiveLostFoundByPoi}
            setActiveLostFound={setActiveLostFound}
            showLostFoundExpiredPlaceholder={showLostFoundExpiredPlaceholder}
            onClose={onClose}
            setEndPoint={setEndPoint}
            setStartPoint={setStartPoint}
            startNavigation={startNavigation}
            selectSubPOI={selectSubPOI}
            setHighlightPoi={setHighlightPoi}
            highlightTimeoutRef={highlightTimeoutRef}
            onViewInMapClick={onViewInMapClick}
          />
        )}
      </div>

      {/* 底部固定操作栏（移动端含安全区） */}
      <div
        className="sticky bottom-0 z-10 flex-shrink-0 border-t border-[#EDEFF1] bg-white p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              analytics.poi.navigateClick({ poi_id: displayPoi.id });
              setEndPoint({ lng: displayPoi.lng, lat: displayPoi.lat, name: displayPoi.name });
              if (userLocation) {
                setStartPoint({ lng: userLocation[0], lat: userLocation[1], name: "我的位置" });
              } else {
                toast("未获取到当前位置，请在左上角导航面板中通过地图选点设置起点");
              }
              startNavigation();
              onClose();
              toast.success("导航已开始");
            }}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#FF4500] px-4 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <Navigation className="h-5 w-5" />
            到这去
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                analytics.nav.startSet({ source: "poi_drawer", poi_id: displayPoi.id });
                setStartPoint({ lng: displayPoi.lng, lat: displayPoi.lat, name: displayPoi.name });
                openNavigationPanel();
                toast.success(`已设为起点：${displayPoi.name}`);
              }}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EDEFF1] bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <MapPin className="h-4 w-4" />
              设为起点
            </button>
            <button
              onClick={() => {
                analytics.nav.endSet({ source: "poi_drawer", poi_id: displayPoi.id });
                setEndPoint({ lng: displayPoi.lng, lat: displayPoi.lat, name: displayPoi.name });
                openNavigationPanel();
                toast.success(`已设为终点：${displayPoi.name}`);
              }}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EDEFF1] bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <MapPin className="h-4 w-4" />
              设为终点
            </button>
          </div>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#EDEFF1] bg-transparent px-4 py-2.5 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
          >
            <Flag className="h-4 w-4" />
            内容报错/违规举报
          </button>
        </div>
      </div>
    </div>
  );
}

/** 图片轮播：多图时横向滑动，单图时静态展示，无图时占位 */
function ImageCarousel({
  images,
  alt,
  unoptimized,
  className = "",
}: {
  images: string[];
  alt: string;
  unoptimized?: (src: string) => boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    const scrollLeft = el.scrollLeft;
    const width = el.clientWidth;
    const index = Math.round(scrollLeft / width);
    setActiveIndex(Math.min(index, images.length - 1));
  }, [images.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, images.length]);

  if (images.length === 0) {
    return (
      <div className={`flex aspect-video w-full items-center justify-center rounded-xl bg-gray-100 ${className}`}>
        <ImageIcon className="h-12 w-12 text-gray-300" aria-hidden />
      </div>
    );
  }
  if (images.length === 1) {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100 ${className}`}>
        <Image
          src={images[0]}
          alt={alt}
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-cover"
          unoptimized={unoptimized?.(images[0])}
        />
      </div>
    );
  }
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100 ${className}`}>
      <div
        ref={scrollRef}
        className="flex h-full w-full overflow-x-auto no-scrollbar snap-x snap-mandatory"
      >
        {images.map((src, i) => (
          <div key={i} className="relative h-full w-full min-w-full flex-none snap-center">
            <Image
              src={src}
              alt={`${alt} (${i + 1}/${images.length})`}
              fill
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
              unoptimized={unoptimized?.(src)}
            />
          </div>
        ))}
      </div>
      {/* 分页点 */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full shadow-sm transition-opacity ${
              i === activeIndex ? "bg-white opacity-100" : "bg-white/60"
            }`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

/** 子 POI 简化视图内容 */
function PoiDrawerSubPoiView({
  displayPoi,
  poiWithChildren,
  isInCooldown,
  isLoadingLiveStatuses,
  activeLiveStatuses,
  reportingStatusType,
  onReportStatus,
}: {
  displayPoi: POIWithStatus;
  poiWithChildren: (POIWithStatus & { children?: SubPOI[] }) | null;
  isInCooldown: boolean;
  isLoadingLiveStatuses: boolean;
  activeLiveStatuses: Array<{ id: string; statusType: string; description: string | null; upvotes: number; createdAt: string }>;
  reportingStatusType: string | null;
  onReportStatus: (statusType: string) => void;
}) {
  const subPoiImages = displayPoi.imageUrl ? [displayPoi.imageUrl] : [];
  return (
    <div className="px-6 py-4">
      <div className="mb-6">
        <ImageCarousel images={subPoiImages} alt={displayPoi.name} />
      </div>
      <div className="mb-6">
        <h3 className="mb-2 text-lg font-semibold text-[#1A1A1B]">{displayPoi.name}</h3>
        {displayPoi.description && <p className="text-sm text-gray-700">{displayPoi.description}</p>}
      </div>
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-[#1A1A1B]">实时情报</h3>
        <p className="mb-3 text-xs text-gray-500">
          {isInCooldown ? "感谢上报，请稍后再提交新情报..." : "点击下方标签上报当前情况，人流情报 20 分钟有效，事件/状态 8 小时有效"}
        </p>
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
          {isLoadingLiveStatuses ? (
            <div className="flex justify-center py-2 text-sm text-gray-500">加载中...</div>
          ) : activeLiveStatuses.length === 0 ? (
            <p className="text-center text-sm text-gray-500">✅ 当前一切正常，暂无异常情报</p>
          ) : (
            <div className="flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible no-scrollbar snap-x snap-mandatory md:snap-none gap-2 space-x-3 md:space-x-0 px-4 md:px-0 -mx-2 md:mx-0">
              {groupStatusesByType(activeLiveStatuses).map(({ statusType, count, latestCreatedAt }) => {
                const config = getStatusBadgeConfig(statusType);
                return (
                  <span key={statusType} className={`inline-flex flex-none snap-center items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${config.className}`}>
                    <span>{config.emoji}</span>
                    <span>{config.label}</span>
                    <span className="text-xs opacity-80">({count}人上报 · {formatRelativeTime(latestCreatedAt)})</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">人流状况</p>
            <div className="grid grid-cols-3 gap-2">
              {LIVE_STATUS_BUTTONS.traffic.map((btn) => (
                <StatusReportButton key={btn.id} btn={btn} reportingStatusType={reportingStatusType} isInCooldown={isInCooldown} onReportStatus={onReportStatus} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">事件/状态</p>
            <div className="grid grid-cols-2 gap-2">
              {LIVE_STATUS_BUTTONS.events.map((btn) => (
                <StatusReportButton key={btn.id} btn={btn} reportingStatusType={reportingStatusType} isInCooldown={isInCooldown} onReportStatus={onReportStatus} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 状态上报按钮（复用） */
function StatusReportButton({
  btn,
  reportingStatusType,
  isInCooldown,
  onReportStatus,
}: {
  btn: { id: string; label: string; emoji: string; className: string };
  reportingStatusType: string | null;
  isInCooldown: boolean;
  onReportStatus: (statusType: string) => void;
}) {
  const isSubmitting = reportingStatusType === btn.id;
  return (
    <button
      type="button"
      onClick={() => onReportStatus(btn.id)}
      disabled={!!reportingStatusType || isInCooldown}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${btn.className}`}
    >
      {isSubmitting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <span className="text-base">{btn.emoji}</span>}
      <span className="truncate">{btn.label}</span>
    </button>
  );
}

/** 父 POI 完整视图内容 */
interface PoiDrawerParentViewContentProps {
  displayPoi: POIWithStatus;
  poiWithChildren: (POIWithStatus & { children?: SubPOI[] }) | null;
  userLocation?: [number, number];
  isInCooldown: boolean;
  isLoadingLiveStatuses: boolean;
  activeLiveStatuses: Array<{ id: string; statusType: string; description: string | null; upvotes: number; createdAt: string }>;
  reportingStatusType: string | null;
  onReportStatus: (statusType: string) => void;
  activeActivities: Array<{ id: string; title: string; description: string; link: string | null; startAt: string; endAt: string }>;
  setSelectedActivity: (a: { id: string; title: string; description: string; link: string | null; startAt: string; endAt: string } | null) => void;
  activeLostFound: Array<{ id: string; description: string; images: string[]; contactInfo: string | null; expiresAt: string; createdAt: string; user: { id: string; nickname: string | null } }>;
  setShowLostFoundForm: (v: boolean) => void;
  onSelectLostFoundItem?: (item: LostFoundItemForSelect) => void;
  currentUser: { id: string; role?: string } | null;
  comments: CommentItem[];
  isLoadingComments: boolean;
  sortBy: "latest" | "popular";
  setSortBy: (v: "latest" | "popular") => void;
  totalCommentCount: number;
  newComment: string;
  setNewComment: (v: string) => void;
  replyingTo: { id: string; name: string } | null;
  setReplyingTo: (v: { id: string; name: string } | null) => void;
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  highlightedCommentId: string | null;
  setProfileModalUserId: (v: string | null) => void;
  onReplyClick: (comment: CommentItem) => void;
  onLikeClick: (commentId: string) => void | Promise<void>;
  onCommentSubmit: () => void;
  isSubmittingComment: boolean;
  isAuthenticated: boolean;
  fetchComments: (sort?: "latest" | "popular") => void;
  schoolId: string;
  getActiveLostFoundByPoi: (poiId: string, schoolId: string) => Promise<{ success: boolean; data?: unknown[] }>;
  setActiveLostFound: React.Dispatch<React.SetStateAction<Array<{ id: string; description: string; images: string[]; contactInfo: string | null; expiresAt: string; createdAt: string; user: { id: string; nickname: string | null } }>>>;
  showLostFoundExpiredPlaceholder: boolean;
  onClose: () => void;
  setEndPoint: (p: { lng: number; lat: number; name: string }) => void;
  setStartPoint: (p: { lng: number; lat: number; name: string }) => void;
  startNavigation: () => void;
  selectSubPOI: (poi: POIWithStatus | null) => void;
  setHighlightPoi: (id: string | null) => void;
  highlightTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onViewInMapClick?: () => void;
}

function PoiDrawerParentViewContent(props: PoiDrawerParentViewContentProps) {
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
    schoolId,
    getActiveLostFoundByPoi,
    setActiveLostFound,
    showLostFoundExpiredPlaceholder,
    onClose,
    setEndPoint,
    setStartPoint,
    startNavigation,
    selectSubPOI,
    setHighlightPoi,
    highlightTimeoutRef,
    onViewInMapClick,
  } = props;
  const router = useRouter();
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
        <ImageCarousel images={parentImages} alt={displayPoi.name} />
      </div>
      {/** 正在进行中的活动（置顶展示，含描述与 Learn More 链接） */}
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
                            toast("未获取到当前位置，请在左上角导航面板中通过地图选点设置起点");
                          }
                        startNavigation();
                        onClose();
                        toast.success("导航已开始");
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
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-[#1A1A1B]">实时情报</h3>
        <p className="mb-3 text-xs text-gray-500">
          {isInCooldown ? "感谢上报，请稍后再提交新情报..." : "点击标签上报当前情况，人流情报 20 分钟有效，事件/状态 8 小时有效"}
        </p>
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
          {isLoadingLiveStatuses ? (
            <div className="flex justify-center py-2 text-sm text-gray-500">加载中...</div>
          ) : activeLiveStatuses.length === 0 ? (
            <p className="text-center text-sm text-gray-500">✅ 当前一切正常，暂无异常情报</p>
          ) : (
            <div className="flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible no-scrollbar snap-x snap-mandatory md:snap-none gap-2 space-x-3 md:space-x-0 px-4 md:px-0 -mx-2 md:mx-0">
              {groupStatusesByType(activeLiveStatuses).map(({ statusType, count, latestCreatedAt }) => {
                const config = getStatusBadgeConfig(statusType);
                return (
                  <span key={statusType} className={`inline-flex flex-none snap-center items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${config.className}`}>
                    <span>{config.emoji}</span>
                    <span>{config.label}</span>
                    <span className="text-xs opacity-80">({count}人上报 · {formatRelativeTime(latestCreatedAt)})</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">人流状况</p>
            <div className="grid grid-cols-3 gap-2">
              {LIVE_STATUS_BUTTONS.traffic.map((btn) => (
                <StatusReportButton key={btn.id} btn={btn} reportingStatusType={reportingStatusType} isInCooldown={isInCooldown} onReportStatus={onReportStatus} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">事件/状态</p>
            <div className="grid grid-cols-2 gap-2">
              {LIVE_STATUS_BUTTONS.events.map((btn) => (
                <StatusReportButton key={btn.id} btn={btn} reportingStatusType={reportingStatusType} isInCooldown={isInCooldown} onReportStatus={onReportStatus} />
              ))}
            </div>
          </div>
        </div>
      </div>
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
                toast.error("请先登录后再发布");
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
                  if (!confirm("确定要删除吗？此操作不可恢复。")) return;
                  try {
                    const result = await deleteComment(id);
                    if (!result.success) throw new Error(result.error || "删除失败");
                    toast.success("已删除");
                    await fetchComments(sortBy);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "删除失败");
                  }
                }}
                onReportComment={async (id) => {
                  try {
                    const result = await reportComment(id);
                    if (!result.success) throw new Error(result.error || "举报失败");
                    toast.success(result.message || "举报已收到");
                    if (result.isAutoHidden) await fetchComments(sortBy);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "举报失败");
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

export function POIDrawer({ poi, schoolId, isOpen, onClose, onStatusUpdate, userLocation, highlightCommentId, highlightLostFoundId, onSelectLostFoundItem, lostFoundListRefreshTrigger }: POIDrawerProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { isAuthenticated, currentUser } = useAuthStore();
  const { setStartPoint, setEndPoint, startNavigation, openNavigationPanel } = useNavigationStore();
  const { setHighlightSubPOI, selectedSubPOI, activePOI, selectSubPOI, setHighlightPoi, clearSelection } = useSchoolStore();

  // 当前展示的 POI：子 POI 选中时显示子 POI，否则显示父 POI（来自 props 或 activePOI）
  const displayPoi = selectedSubPOI ?? poi ?? activePOI;
  const isSubPoiView = !!selectedSubPOI;

  // 带 children 的 POI 详情（打开抽屉时拉取）
  const [poiWithChildren, setPoiWithChildren] = useState<POIWithStatus & { children?: SubPOI[] } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportDescription, setReportDescription] = useState<string>("");
  const [isReporting, setIsReporting] = useState(false);

  // 留言相关状态
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [sortBy, setSortBy] = useState<"latest" | "popular">("latest");
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  // 回复相关状态：{ id, name } 或 null
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  /** 移动端 Bottom Sheet 当前 snap point（0.35 = Preview，1 = Expanded，相对于 h-[85dvh] 容器） */
  const [snap, setSnap] = useState<number | string | null>(0.35);
  const drawerOpenTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && !isDesktop) {
      setSnap(0.35);
    }
  }, [isOpen, isDesktop]);

  // 打开抽屉埋点
  useEffect(() => {
    if (isOpen && displayPoi) {
      drawerOpenTimeRef.current = Date.now();
      analytics.poi.drawerOpen({
        poi_id: displayPoi.id,
        poi_name: displayPoi.name,
        source: selectedSubPOI ? "sub_poi" : poi ? "marker" : "search",
      });
    } else if (!isOpen) {
      drawerOpenTimeRef.current = null;
    }
  }, [isOpen, displayPoi?.id, displayPoi?.name, selectedSubPOI, poi]);

  const handleClose = useCallback(() => {
    if (displayPoi && drawerOpenTimeRef.current) {
      const duration = Date.now() - drawerOpenTimeRef.current;
      analytics.poi.drawerClose({ poi_id: displayPoi.id, duration_ms: duration });
    }
    drawerOpenTimeRef.current = null;
    onClose();
  }, [displayPoi, onClose]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  // 从 URL 跳转时：留言加载完成后滚动到目标留言并高亮 3 秒
  // 使用 setTimeout 等待 React 完成 DOM 渲染后再查询元素，避免元素未挂载导致滚动失败
  useEffect(() => {
    if (!highlightCommentId || isLoadingComments || comments.length === 0) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${highlightCommentId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedCommentId(highlightCommentId);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedCommentId(null);
          highlightTimeoutRef.current = null;
        }, 3000);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, [highlightCommentId, isLoadingComments, comments]);

  // 活动（Activity）相关
  const [activeActivities, setActiveActivities] = useState<
    Array<{ id: string; title: string; description: string; link: string | null; startAt: string; endAt: string }>
  >([]);
  const [selectedActivity, setSelectedActivity] = useState<{
    id: string;
    title: string;
    description: string;
    link: string | null;
    startAt: string;
    endAt: string;
  } | null>(null);

  // 失物招领（Lost & Found）相关
  const [showLostFoundExpiredPlaceholder, setShowLostFoundExpiredPlaceholder] = useState(false);
  const [showLostFoundForm, setShowLostFoundForm] = useState(false);
  const [activeLostFound, setActiveLostFound] = useState<
    Array<{
      id: string;
      description: string;
      images: string[];
      contactInfo: string | null;
      expiresAt: string;
      createdAt: string;
      user: { id: string; nickname: string | null };
    }>
  >([]);

  // 实时情报（Live Status）相关
  const [activeLiveStatuses, setActiveLiveStatuses] = useState<
    Array<{ id: string; statusType: string; description: string | null; upvotes: number; createdAt: string }>
  >([]);
  const [isLoadingLiveStatuses, setIsLoadingLiveStatuses] = useState(false);
  const [reportingStatusType, setReportingStatusType] = useState<string | null>(null);
  const [lastReportedTime, setLastReportedTime] = useState<number | null>(null);

  // 收藏相关
  const [isFavorited, setIsFavorited] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  // 60 秒冷却结束后清除 lastReportedTime，触发重渲染
  useEffect(() => {
    if (lastReportedTime === null) return;
    const timer = setTimeout(() => setLastReportedTime(null), REPORT_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [lastReportedTime]);

  const isInCooldown = lastReportedTime !== null && Date.now() - lastReportedTime < REPORT_COOLDOWN_MS;

  // 加载留言列表（支持 sortBy，仅父 POI 视图需要）
  // poi/activePOI 仅用 id，避免引用变化导致 fetchComments 频繁重建触发重复请求
  const fetchComments = useCallback(
    async (sort: "latest" | "popular" = sortBy) => {
      const targetPoi = selectedSubPOI ? null : (poi ?? activePOI);
      if (!targetPoi) return;
      setIsLoadingComments(true);
      try {
        const result = await getPOIComments(targetPoi.id, 1, 20, sort);
        if (result.success && result.comments) {
          const treeComments = buildCommentTree(result.comments);
          setComments(treeComments);
        }
      } catch (error) {
        console.error("获取留言列表失败:", error);
      } finally {
        setIsLoadingComments(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poi?.id/activePOI?.id 足够，避免引用变化触发重复请求
    [poi?.id, activePOI?.id, selectedSubPOI, sortBy]
  );

  useEffect(() => {
    if (selectedSubPOI || !(poi ?? activePOI) || !isOpen) return;
    fetchComments(sortBy);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchComments 已包含 sortBy，poi/activePOI 仅用 id
  }, [poi?.id, activePOI?.id, selectedSubPOI, isOpen, fetchComments]);

  // 打开抽屉时拉取 POI 详情（含 children）
  useEffect(() => {
    const targetPoi = displayPoi ?? poi;
    if (!targetPoi || !isOpen) {
      setPoiWithChildren(null);
      return;
    }
    const fetchDetail = async () => {
      try {
        const result = await getPOIDetail(targetPoi.id);
        if (result.success && result.data?.poi) {
          const { poi } = result.data;
          setPoiWithChildren({
            ...targetPoi,
            ...poi,
            category: (poi.category ?? targetPoi.category ?? "其他") as POIWithStatus["category"],
            children: poi.children ?? [],
          } as POIWithStatus & { children?: SubPOI[] });
        } else {
          setPoiWithChildren({ ...targetPoi, children: [] });
        }
      } catch {
        setPoiWithChildren({ ...targetPoi, children: [] });
      }
    };
    fetchDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- displayPoi?.id/poi?.id 足够，避免引用变化触发重复请求
  }, [displayPoi?.id, poi?.id, isOpen]);

  // 加载活动列表（抽屉打开或 displayPoi 变化时，仅父 POI 视图）
  useEffect(() => {
    const targetPoi = selectedSubPOI ? null : (poi ?? activePOI);
    const fetchActivities = async () => {
      if (!targetPoi || !schoolId || !isOpen) return;
      try {
        const result = await getActiveActivitiesByPoi(targetPoi.id, schoolId);
        if (result.success && result.data) {
          setActiveActivities(result.data);
        } else {
          setActiveActivities([]);
        }
      } catch {
        setActiveActivities([]);
      }
    };
    fetchActivities();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- poi?.id/activePOI?.id 足够，避免引用变化触发重复请求
  }, [poi?.id, activePOI?.id, selectedSubPOI, schoolId, isOpen]);

  // 加载失物招领列表（抽屉打开或 displayPoi 变化时，仅父 POI 视图）
  useEffect(() => {
    const targetPoi = selectedSubPOI ? null : (poi ?? activePOI);
    const fetchLostFound = async () => {
      if (!targetPoi || !schoolId || !isOpen) return;
      setShowLostFoundExpiredPlaceholder(false);
      try {
        const result = await getActiveLostFoundByPoi(targetPoi.id, schoolId);
        if (result.success && result.data) {
          setActiveLostFound(result.data);
        } else {
          setActiveLostFound([]);
        }
      } catch {
        setActiveLostFound([]);
      }
    };
    fetchLostFound();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- poi?.id/activePOI?.id 足够，避免引用变化触发重复请求
  }, [poi?.id, activePOI?.id, selectedSubPOI, schoolId, isOpen, lostFoundListRefreshTrigger]);

  // Deep link 保护：当 URL 带有 lostFoundId 且该条不在有效列表中时，检查是否已过期
  useEffect(() => {
    const targetPoi = selectedSubPOI ? null : (poi ?? activePOI);
    if (!highlightLostFoundId || !targetPoi || !schoolId || !isOpen) {
      return;
    }
    const checkExpired = async () => {
      const inList = activeLostFound.some((i) => i.id === highlightLostFoundId);
      if (inList) return;
      const result = await checkLostFoundEvent(highlightLostFoundId, targetPoi.id, schoolId);
      if (result.success && result.data?.exists && result.data?.expired) {
        setShowLostFoundExpiredPlaceholder(true);
      }
    };
    checkExpired();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- poi?.id/activePOI?.id 足够，避免引用变化触发重复请求
  }, [highlightLostFoundId, poi?.id, activePOI?.id, selectedSubPOI, schoolId, isOpen, activeLostFound]);

  // 加载收藏状态（抽屉打开或 displayPoi 变化时）
  useEffect(() => {
    const targetPoi = displayPoi ?? poi;
    if (!targetPoi || !isOpen || !isAuthenticated) {
      setIsFavorited(false);
      return;
    }
    const check = async () => {
      const result = await checkIsFavorite(targetPoi.id);
      if (result.success && result.data != null) {
        setIsFavorited(result.data);
      }
    };
    check();
  }, [displayPoi?.id, poi?.id, isOpen, isAuthenticated]);

  // 加载实时情报列表（抽屉打开或 displayPoi 变化时）
  useEffect(() => {
    const targetPoi = displayPoi ?? poi;
    if (!targetPoi || !schoolId || !isOpen) return;
    setIsLoadingLiveStatuses(true);
    const fetchLiveStatuses = async () => {
      try {
        const result = await getActiveStatusesByPoi(targetPoi.id, schoolId);
        if (result.success && result.data) {
          setActiveLiveStatuses(result.data);
        }
      } catch (error) {
        console.error("获取实时情报失败:", error);
      } finally {
        setIsLoadingLiveStatuses(false);
      }
    };
    fetchLiveStatuses();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- displayPoi?.id/poi?.id 足够，避免引用变化触发重复请求
  }, [displayPoi?.id, poi?.id, schoolId, isOpen]);

  // 计算总留言数（包括回复）
  const totalCommentCount = useMemo(() => {
    const countReplies = (comments: CommentItem[]): number => {
      return comments.reduce((sum, comment) => {
        return sum + 1 + (comment.replies ? countReplies(comment.replies) : 0);
      }, 0);
    };
    return countReplies(comments);
  }, [comments]);

  // 统一提交：新留言或回复
  const handleCommentSubmit = async () => {
    const targetPoi = selectedSubPOI ? null : (poi ?? activePOI);
    if (!targetPoi) {
      toast.error("POI 信息不存在");
      return;
    }
    const content = newComment.trim();
    if (!content) {
      toast.error(replyingTo ? "回复内容不能为空" : "留言内容不能为空");
      return;
    }
    if (content.length > 500) {
      toast.error("内容过长（最多 500 字）");
      return;
    }

    setIsSubmittingComment(true);
    try {
      analytics.comment.submit({ poi_id: targetPoi.id, has_parent_id: !!replyingTo?.id });
      const result = await createComment({
        poiId: targetPoi.id,
        content,
        parentId: replyingTo?.id ?? null,
      });
      if (!result.success) throw new Error(result.error || "发送失败");

      analytics.comment.submitSuccess({ poi_id: targetPoi.id });
      await fetchComments(sortBy);

      const wasReply = !!replyingTo;
      setNewComment("");
      setReplyingTo(null);
      toast.success(wasReply ? "回复已发表" : "留言已发表");
    } catch (error) {
      analytics.comment.submitFail({
        poi_id: targetPoi.id,
        error_reason: error instanceof Error ? error.message : "发送失败，请重试",
      });
      toast.error(error instanceof Error ? error.message : "发送失败，请重试");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 点赞（乐观更新）
  const handleLikeClick = async (commentId: string) => {
    if (!isAuthenticated) {
      toast.error("请先登录");
      return;
    }
    const comment = findCommentInTree(comments, commentId);
    if (!comment) return;

    const prevLiked = comment.isLikedByMe;
    const prevCount = comment.likeCount;

    setComments((prev) =>
      updateCommentInTree(prev, commentId, (c) => ({
        ...c,
        isLikedByMe: !prevLiked,
        likeCount: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
      }))
    );

    try {
      analytics.comment.likeClick({ comment_id: commentId, action: prevLiked ? "unlike" : "like" });
      const result = await toggleCommentLike(commentId);
      if (!result.success) {
        setComments((p) =>
          updateCommentInTree(p, commentId, (c) => ({
            ...c,
            isLikedByMe: prevLiked,
            likeCount: prevCount,
          }))
        );
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      setComments((p) =>
        updateCommentInTree(p, commentId, (c) => ({
          ...c,
          isLikedByMe: prevLiked,
          likeCount: prevCount,
        }))
      );
      toast.error("操作失败，请重试");
    }
  };

  // 点击「回复」：设置 replyingTo、聚焦输入框并滚动到可见
  const handleReplyClick = (comment: CommentItem) => {
    analytics.comment.replyClick({ comment_id: comment.id });
    setReplyingTo({ id: comment.id, name: comment.user.nickname || comment.user.email?.split("@")[0] || "匿名用户" });
    requestAnimationFrame(() => {
      commentInputRef.current?.focus();
      commentInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleClose();
      }
    },
    [handleClose]
  );

  // 切换收藏（必须在 early return 之前，遵守 Hooks 规则）
  const handleToggleFavorite = useCallback(async () => {
    if (!displayPoi || !isAuthenticated || isTogglingFavorite) return;
    setIsTogglingFavorite(true);
    try {
      const result = await toggleFavorite(displayPoi.id);
      if (result.success && result.data != null) {
        setIsFavorited(result.data.isFavorited);
        toast.success(result.data.isFavorited ? "已收藏" : "已取消收藏");
      } else {
        toast.error(result.error ?? "操作失败");
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setIsTogglingFavorite(false);
    }
  }, [displayPoi?.id, isAuthenticated, isTogglingFavorite]);

  if (!displayPoi) return null;

  const CategoryIcon = getCategoryIcon(displayPoi.category);

  // 上报实时情报（含乐观更新与冷却）
  const handleReportStatus = async (statusType: string) => {
    if (!isAuthenticated) {
      toast.error("请先登录后再上报情报");
      router.push("/login");
      return;
    }
    if (isInCooldown) return;

    const targetPoi = selectedSubPOI ?? poi ?? activePOI;
    if (targetPoi) {
      analytics.poi.statusReportSubmit({ poi_id: targetPoi.id, status_type: statusType });
    }

    const optimisticId = `${OPTIMISTIC_ID_PREFIX}${statusType}-${Date.now()}`;
    const optimisticStatus = {
      id: optimisticId,
      statusType,
      description: null as string | null,
      upvotes: 0,
      createdAt: new Date().toISOString(),
    };

    setReportingStatusType(statusType);
    setActiveLiveStatuses((prev) => [optimisticStatus, ...prev]);

    try {
      const result = await reportLiveStatus(displayPoi.id, statusType);
      if (result.success) {
        setLastReportedTime(Date.now());
        analytics.poi.statusReportSuccess({ poi_id: displayPoi.id });
        toast.success("感谢您的情报！人流情报 20 分钟有效，事件/状态 8 小时有效");
        const refresh = await getActiveStatusesByPoi(displayPoi.id, schoolId);
        if (refresh.success && refresh.data) {
          setActiveLiveStatuses(refresh.data);
        }
        onStatusUpdate?.();
      } else {
        setActiveLiveStatuses((prev) => prev.filter((s) => s.id !== optimisticId));
        toast.error(result.error ?? "上报失败");
      }
    } catch {
      setActiveLiveStatuses((prev) => prev.filter((s) => s.id !== optimisticId));
      toast.error("上报失败，请重试");
    } finally {
      setReportingStatusType(null);
    }
  };

  // 处理举报
  const handleReport = async () => {
    if (!reportReason) {
      toast.error("请选择举报原因");
      return;
    }

    setIsReporting(true);

    try {
      const { reportPOI } = await import("@/lib/poi-actions");
      const result = await reportPOI(
        displayPoi.id,
        reportReason,
        reportDescription || undefined
      );

      if (!result.success) {
        throw new Error(result.error || "举报失败");
      }

      toast.success("举报成功，感谢您的反馈！");
      setShowReportModal(false);
      setReportReason("");
      setReportDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "举报失败，请重试");
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && isDesktop && (
          <>
            {/* 遮罩层（仅桌面端）：覆盖 Navbar 下方区域，保持搜索栏与学校切换器可点击 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed below-nav right-0 bottom-0 left-0 z-modal-overlay bg-black/50"
              onClick={handleClose}
            />

            {/* 桌面端右侧抽屉 */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                handleClose();
              }
            }}
            className="fixed right-0 below-nav z-modal-content flex h-below-nav w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <PoiDrawerContent
              displayPoi={displayPoi}
              isSubPoiView={isSubPoiView}
              poiWithChildren={poiWithChildren}
              CategoryIcon={CategoryIcon}
              onClose={handleClose}
              selectSubPOI={selectSubPOI}
              userLocation={userLocation}
              isInCooldown={isInCooldown}
              isLoadingLiveStatuses={isLoadingLiveStatuses}
              activeLiveStatuses={activeLiveStatuses}
              reportingStatusType={reportingStatusType}
              onReportStatus={handleReportStatus}
              activeActivities={activeActivities}
              selectedActivity={selectedActivity}
              setSelectedActivity={setSelectedActivity}
              activeLostFound={activeLostFound}
              setShowLostFoundForm={setShowLostFoundForm}
              onSelectLostFoundItem={onSelectLostFoundItem}
              setEndPoint={setEndPoint}
              setStartPoint={setStartPoint}
              startNavigation={startNavigation}
              openNavigationPanel={openNavigationPanel}
              setHighlightPoi={setHighlightPoi}
              highlightTimeoutRef={highlightTimeoutRef}
              onViewInMapClick={!isDesktop ? () => setSnap(0.35) : undefined}
              setShowReportModal={setShowReportModal}
              comments={comments}
              isLoadingComments={isLoadingComments}
              sortBy={sortBy}
              setSortBy={setSortBy}
              totalCommentCount={totalCommentCount}
              newComment={newComment}
              setNewComment={setNewComment}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              commentInputRef={commentInputRef}
              highlightedCommentId={highlightedCommentId}
              setProfileModalUserId={setProfileModalUserId}
              onReplyClick={handleReplyClick}
              onLikeClick={handleLikeClick}
              onCommentSubmit={handleCommentSubmit}
              isSubmittingComment={isSubmittingComment}
              isAuthenticated={isAuthenticated}
              currentUser={currentUser}
              fetchComments={fetchComments}
              schoolId={schoolId}
              isFavorited={isFavorited}
              isTogglingFavorite={isTogglingFavorite}
              onToggleFavorite={handleToggleFavorite}
              getActiveLostFoundByPoi={getActiveLostFoundByPoi}
              setActiveLostFound={setActiveLostFound}
              showLostFoundExpiredPlaceholder={showLostFoundExpiredPlaceholder}
            />
          </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 移动端 Bottom Sheet：始终挂载以便 vaul 执行关闭动画 */}
      {!isDesktop && (
          <Drawer.Root
            open={isOpen}
            onOpenChange={handleDrawerOpenChange}
            snapPoints={[0.35, 1]}
            activeSnapPoint={snap}
            setActiveSnapPoint={setSnap}
            fadeFromIndex={0}
            modal={false}
            dismissible
          >
            <Drawer.Portal>
              <Drawer.Overlay
                className={`transition-colors duration-200 z-[100] ${
                  snap === 1
                    ? "bg-black/40 cursor-pointer"
                    : "bg-transparent pointer-events-none"
                }`}
                onClick={snap === 1 ? () => handleDrawerOpenChange(false) : undefined}
              />
              <Drawer.Content
                className="fixed bottom-0 left-0 right-0 z-[110] mx-auto flex w-full max-w-[var(--mobile-content-max)] flex-col bg-white h-[85dvh] rounded-t-[14px] focus:outline-none"
              >
                {/* 1. Fixed Drag Handle Area (Grabbable) */}
                <div className="flex-none pt-4 pb-2 w-full flex justify-center bg-white rounded-t-[14px] cursor-grab active:cursor-grabbing">
                  <div className="w-12 h-1.5 bg-gray-300 rounded-full" aria-hidden />
                </div>

                {/* 2. Scrollable Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 pb-8" data-vaul-no-drag>
                  <PoiDrawerContent
                    displayPoi={displayPoi}
                    isSubPoiView={isSubPoiView}
                    poiWithChildren={poiWithChildren}
                    CategoryIcon={CategoryIcon}
                    onClose={handleClose}
                    selectSubPOI={selectSubPOI}
                    userLocation={userLocation}
                    isInCooldown={isInCooldown}
                    isLoadingLiveStatuses={isLoadingLiveStatuses}
                    activeLiveStatuses={activeLiveStatuses}
                    reportingStatusType={reportingStatusType}
                    onReportStatus={handleReportStatus}
                    activeActivities={activeActivities}
                    selectedActivity={selectedActivity}
                    setSelectedActivity={setSelectedActivity}
                    activeLostFound={activeLostFound}
                    setShowLostFoundForm={setShowLostFoundForm}
                    setEndPoint={setEndPoint}
                    setStartPoint={setStartPoint}
                    startNavigation={startNavigation}
                    openNavigationPanel={openNavigationPanel}
                    setHighlightPoi={setHighlightPoi}
                    highlightTimeoutRef={highlightTimeoutRef}
                    onViewInMapClick={() => setSnap(0.35)}
                    setShowReportModal={setShowReportModal}
                    comments={comments}
                    isLoadingComments={isLoadingComments}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    totalCommentCount={totalCommentCount}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    replyingTo={replyingTo}
                    setReplyingTo={setReplyingTo}
                    commentInputRef={commentInputRef}
                    highlightedCommentId={highlightedCommentId}
                    setProfileModalUserId={setProfileModalUserId}
                    onReplyClick={handleReplyClick}
                    onLikeClick={handleLikeClick}
                    onCommentSubmit={handleCommentSubmit}
                    isSubmittingComment={isSubmittingComment}
                    isAuthenticated={isAuthenticated}
                    currentUser={currentUser}
                    fetchComments={fetchComments}
                    schoolId={schoolId}
                    isFavorited={isFavorited}
                    isTogglingFavorite={isTogglingFavorite}
                    onToggleFavorite={handleToggleFavorite}
                    getActiveLostFoundByPoi={getActiveLostFoundByPoi}
                    setActiveLostFound={setActiveLostFound}
                    showLostFoundExpiredPlaceholder={showLostFoundExpiredPlaceholder}
                  />
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
      )}

      {/* 举报/活动/失物招领/用户资料等 Modal（isOpen 时渲染） */}
      {isOpen && (
        <>
          {/* 举报弹窗 - Portal 渲染到 body，z-index 高于 Drawer(110)，确保遮罩覆盖抽屉 */}
          {showReportModal &&
            createPortal(
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
                  onClick={() => setShowReportModal(false)}
                  role="presentation"
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="z-[210] relative modal-container max-w-md w-full mx-auto bg-white rounded-xl shadow-xl overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="report-poi-title"
                  >
                  <h3 id="report-poi-title" className="modal-header px-6 pt-6 text-lg font-semibold text-gray-900">举报 POI</h3>

                  <div className="modal-body space-y-4 px-6 py-4 scrollbar-gutter-stable">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        举报原因 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                      >
                        <option value="">请选择举报原因</option>
                        <option value="定位不准">定位不准</option>
                        <option value="信息错误">信息错误</option>
                        <option value="有害内容">有害内容</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        详细描述（可选）
                      </label>
                      <textarea
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        placeholder="请描述具体问题..."
                        rows={3}
                        className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                      />
                    </div>
                  </div>

                  <div className="modal-footer flex gap-3 border-t border-gray-100 px-6 py-4">
                      <button
                        onClick={() => {
                          setShowReportModal(false);
                          setReportReason("");
                          setReportDescription("");
                        }}
                        className="flex-1 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleReport}
                        disabled={isReporting || !reportReason}
                        className="flex-1 rounded-full bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isReporting ? "提交中..." : "提交举报"}
                      </button>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>,
              document.body
            )}

          {/* 活动详情弹窗 - 独立组件，Portal + 严格居中 */}
          <ActivityDetailModal
            activity={selectedActivity}
            isOpen={!!selectedActivity}
            onClose={() => setSelectedActivity(null)}
          />

          {/* 失物招领发布弹窗 - Portal 渲染到 body，z-index 高于 Navbar(40) 和 Drawer(110) */}
          {showLostFoundForm &&
            displayPoi &&
            !selectedSubPOI &&
            createPortal(
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "fixed inset-0 z-[200] flex items-center justify-center p-4",
                    "bg-black/50"
                  )}
                  onClick={() => setShowLostFoundForm(false)}
                  role="presentation"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "z-[210] relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl",
                      "max-h-[min(90vh,calc(100vh-40px))]"
                    )}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="lost-found-modal-title"
                  >
                    <div className="modal-header flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                      <h3 id="lost-found-modal-title" className="text-base font-semibold text-[#1A1A1B]">
                        发布失物招领
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowLostFoundForm(false)}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="关闭"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="modal-body min-h-0 flex-1 overflow-y-auto p-4 scrollbar-gutter-stable">
                      <LostFoundForm
                        poiId={displayPoi.id}
                        schoolId={schoolId}
                        onSuccess={async () => {
                          const result = await getActiveLostFoundByPoi(displayPoi.id, schoolId);
                          if (result.success && result.data) {
                            setActiveLostFound(result.data);
                          }
                          setShowLostFoundForm(false);
                        }}
                        onClose={() => setShowLostFoundForm(false)}
                        inline={false}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              </AnimatePresence>,
              document.body
            )}

          <UserProfileModal
            userId={profileModalUserId}
            isOpen={!!profileModalUserId}
            onClose={() => setProfileModalUserId(null)}
          />
        </>
      )}
    </>
  );
}

/** 自动调整高度的留言输入框（max 150px） */
const CommentTextarea = forwardRef<HTMLTextAreaElement | null, React.ComponentProps<"textarea">>(function CommentTextarea({ value, onChange, placeholder, ...props }, ref) {
  const adjustHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      adjustHeight(node);
    },
    [ref, adjustHeight]
  );

  useEffect(() => {
    const el = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
    if (el) adjustHeight(el);
  }, [value, ref, adjustHeight]);

  return (
    <textarea
      ref={setRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={2}
      className="min-h-[60px] max-h-[150px] w-full resize-none overflow-y-auto rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
      {...props}
    />
  );
});

/** 2 级扁平化留言块：根评论 + 展平回复区 */
interface CommentBlockProps {
  root: CommentItem;
  currentUser: any;
  isAuthenticated: boolean;
  highlightedCommentId?: string | null;
  onAvatarClick?: (userId: string) => void;
  onReplyClick: (comment: CommentItem) => void;
  onLikeClick: (commentId: string) => void | Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onReportComment: (id: string) => Promise<void>;
}

const CommentBlock = memo(function CommentBlock({
  root,
  currentUser,
  isAuthenticated,
  highlightedCommentId,
  onAvatarClick,
  onReplyClick,
  onLikeClick,
  onDeleteComment,
  onReportComment,
}: CommentBlockProps) {
  const [isReporting, setIsReporting] = useState<Record<string, boolean>>({});
  const flatReplies = flattenReplies(root.replies || []);

  const renderCommentRow = (comment: CommentItem, isReply: boolean) => {
    const isHidden = comment.isHidden;
    const canDelete = currentUser && (currentUser.id === comment.user.id || ["ADMIN", "STAFF", "SUPER_ADMIN"].includes(currentUser.role));
    const isHighlighted = highlightedCommentId === comment.id;

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`transition-colors duration-300 ${isReply ? "py-2 first:pt-0 last:pb-0" : ""} ${
          isHighlighted
            ? "animate-comment-highlight rounded-lg bg-[#FFE5DD]/60 px-2 py-1.5 ring-2 ring-[#FF4500]/40 ring-offset-2"
            : ""
        }`}
      >
        <div className="flex gap-2">
          {!isReply && (
            <button
              type="button"
              onClick={() => onAvatarClick?.(comment.user.id)}
              className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#EDEFF1] text-xs font-semibold text-[#1A1A1B] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#FF4500]/40"
              title="查看资料"
            >
              {comment.user.avatar ? (
                <Image
                  src={comment.user.avatar}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                  unoptimized={comment.user.avatar.startsWith("blob:")}
                />
              ) : (
                (comment.user.nickname || comment.user.email?.split("@")[0] || "游客").slice(0, 2)
              )}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAvatarClick?.(comment.user.id)}
                className="text-left font-medium text-slate-800 hover:text-[#FF4500] hover:underline focus:outline-none focus:ring-0"
                title="查看资料"
              >
                {comment.user.nickname || comment.user.email?.split("@")[0] || "匿名用户"}
              </button>
              <span className="text-[10px] text-[#7C7C7C] shrink-0">
                {new Date(comment.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className={`whitespace-pre-line break-words text-sm ${isHidden ? "text-[#7C7C7C] italic" : "text-[#1A1A1B]"}`}>
              {isHidden ? (
                "此评论已被折叠"
              ) : comment.parent ? (
                <>
                  回复 <span className="text-[#FF4500]">@{comment.parent.user.nickname || "匿名用户"}</span>: {comment.content}
                </>
              ) : (
                comment.content
              )}
            </div>
            {!isHidden && (
              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                <button
                  type="button"
                  onClick={() => onLikeClick(comment.id)}
                  className={`inline-flex items-center gap-1 transition-colors hover:text-[#1A1A1B] ${
                    (comment.isLikedByMe ?? false) ? "text-red-500" : ""
                  }`}
                >
                  <Heart
                    className={`h-4 w-4 ${(comment.isLikedByMe ?? false) ? "fill-current" : ""}`}
                  />
                  <span>
                    {(comment.likeCount ?? 0) > 0 ? comment.likeCount : "赞"}
                  </span>
                </button>
                {isAuthenticated && (
                  <button onClick={() => onReplyClick(comment)} className="hover:text-[#1A1A1B]">
                    ↩ 回复
                  </button>
                )}
                <button onClick={async () => { if (isReporting[comment.id]) return; setIsReporting((p) => ({ ...p, [comment.id]: true })); try { await onReportComment(comment.id); } finally { setIsReporting((p) => ({ ...p, [comment.id]: false })); }} } disabled={isReporting[comment.id]} className="hover:text-[#1A1A1B] disabled:opacity-50">
                  {isReporting[comment.id] ? "举报中..." : "🚩 举报"}
                </button>
                {canDelete && (
                  <button onClick={() => onDeleteComment(comment.id)} className="hover:text-red-600">
                    🗑 删除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {renderCommentRow(root, false)}
      {flatReplies.length > 0 && (
        <div className="ml-10 mt-1 rounded-lg bg-gray-50 p-2">
          {flatReplies.map((reply) => renderCommentRow(reply, true))}
        </div>
      )}
    </div>
  );
});
