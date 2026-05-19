"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { analytics } from "@/lib/analytics";
import { useAuthStore } from "@/store/use-auth-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSchoolStore } from "@/store/use-school-store";
import type { POIWithStatus } from "@/lib/geo/poi-utils";
import { getCategoryIcon } from "@/lib/geo/poi-utils";
import { reportLiveStatus, getActiveStatusesByPoi } from "@/lib/actions/status";
import { toggleFavorite, checkIsFavorite } from "@/lib/actions/favorite";
import { getActiveActivitiesByPoi } from "@/lib/actions/activity";
import { getActiveLostFoundByPoi, checkLostFoundEvent } from "@/lib/actions/lost-found";
import { toggleCommentLike, getPOIComments, createComment } from "@/lib/actions/comment";
import { getPOIDetail } from "@/lib/actions/poi";
import { notify } from "@/lib/ui/notify";
import {
  buildCommentTree,
  findCommentInTree,
  updateCommentInTree,
  REPORT_COOLDOWN_MS,
  OPTIMISTIC_ID_PREFIX,
} from "@/lib/poi-drawer";
import type {
  ActivityItem,
  LiveStatusItem,
  LostFoundItem,
  POIDrawerProps,
  SubPOI,
} from "@/lib/poi-drawer/types";
import type { CommentItem } from "@/components/poi-drawer/poi-comment-block";
import type { PoiDrawerContextValue } from "@/components/poi-drawer/poi-drawer-context";

export function usePoiDrawerController(
  props: POIDrawerProps,
  _isDesktop: boolean
): PoiDrawerContextValue | null {
  const {
    poi,
    schoolId,
    isOpen,
    onClose,
    onStatusUpdate,
    userLocation,
    highlightCommentId,
    highlightLostFoundId,
    onSelectLostFoundItem,
    lostFoundListRefreshTrigger,
  } = props;

  const router = useRouter();
  const { isAuthenticated, currentUser } = useAuthStore();
  const { setStartPoint, setEndPoint, startNavigation, openNavigationPanel } = useNavigationStore();
  const { selectedSubPOI, activePOI, selectSubPOI, setHighlightPoi } = useSchoolStore();

  const displayPoi = selectedSubPOI ?? poi ?? activePOI;
  const isSubPoiView = !!selectedSubPOI;

  const [poiWithChildren, setPoiWithChildren] = useState<POIWithStatus & { children?: SubPOI[] } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportDescription, setReportDescription] = useState<string>("");
  const [isReporting, setIsReporting] = useState(false);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [sortBy, setSortBy] = useState<"latest" | "popular">("latest");
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  const drawerOpenTimeRef = useRef<number | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅依赖 id/name 等，避免 displayPoi 引用变化导致重复埋点
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

  const [activeActivities, setActiveActivities] = useState<ActivityItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  const [showLostFoundExpiredPlaceholder, setShowLostFoundExpiredPlaceholder] = useState(false);
  const [showLostFoundForm, setShowLostFoundForm] = useState(false);
  const [activeLostFound, setActiveLostFound] = useState<LostFoundItem[]>([]);

  const [activeLiveStatuses, setActiveLiveStatuses] = useState<LiveStatusItem[]>([]);
  const [isLoadingLiveStatuses, setIsLoadingLiveStatuses] = useState(false);
  const [reportingStatusType, setReportingStatusType] = useState<string | null>(null);
  const [lastReportedTime, setLastReportedTime] = useState<number | null>(null);

  const [isFavorited, setIsFavorited] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  useEffect(() => {
    if (lastReportedTime === null) return;
    const timer = setTimeout(() => setLastReportedTime(null), REPORT_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [lastReportedTime]);

  const isInCooldown = lastReportedTime !== null && Date.now() - lastReportedTime < REPORT_COOLDOWN_MS;

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
          const { poi: detailPoi } = result.data;
          setPoiWithChildren({
            ...targetPoi,
            ...detailPoi,
            category: (detailPoi.category ?? targetPoi.category ?? "其他") as POIWithStatus["category"],
            children: detailPoi.children ?? [],
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 用 id 稳定依赖，避免 displayPoi/poi 引用抖动重复请求
  }, [displayPoi?.id, poi?.id, isOpen, isAuthenticated]);

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

  const totalCommentCount = useMemo(() => {
    const countReplies = (items: CommentItem[]): number => {
      return items.reduce((sum, comment) => {
        return sum + 1 + (comment.replies ? countReplies(comment.replies) : 0);
      }, 0);
    };
    return countReplies(comments);
  }, [comments]);

  const handleCommentSubmit = async () => {
    const targetPoi = selectedSubPOI ? null : (poi ?? activePOI);
    if (!targetPoi) {
      notify.error("POI 信息不存在");
      return;
    }
    const content = newComment.trim();
    if (!content) {
      notify.error(replyingTo ? "回复内容不能为空" : "留言内容不能为空");
      return;
    }
    if (content.length > 500) {
      notify.error("内容过长（最多 500 字）");
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
      notify.success(wasReply ? "回复已发表" : "留言已发表");
    } catch (error) {
      analytics.comment.submitFail({
        poi_id: targetPoi.id,
        error_reason: error instanceof Error ? error.message : "发送失败，请重试",
      });
      notify.error(error instanceof Error ? error.message : "发送失败，请重试");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleLikeClick = async (commentId: string) => {
    if (!isAuthenticated) {
      notify.error("请先登录");
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
        notify.error(result.error ?? "操作失败");
      }
    } catch {
      setComments((p) =>
        updateCommentInTree(p, commentId, (c) => ({
          ...c,
          isLikedByMe: prevLiked,
          likeCount: prevCount,
        }))
      );
      notify.error("操作失败，请重试");
    }
  };

  const handleReplyClick = (comment: CommentItem) => {
    analytics.comment.replyClick({ comment_id: comment.id });
    setReplyingTo({ id: comment.id, name: comment.user.nickname || comment.user.email?.split("@")[0] || "匿名用户" });
    requestAnimationFrame(() => {
      commentInputRef.current?.focus();
      commentInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleToggleFavorite = useCallback(async () => {
    if (!displayPoi || !isAuthenticated || isTogglingFavorite) return;
    setIsTogglingFavorite(true);
    try {
      const result = await toggleFavorite(displayPoi.id);
      if (result.success && result.data != null) {
        setIsFavorited(result.data.isFavorited);
        notify.success(result.data.isFavorited ? "已收藏" : "已取消收藏");
      } else {
        notify.error(result.error ?? "操作失败");
      }
    } catch {
      notify.error("操作失败，请重试");
    } finally {
      setIsTogglingFavorite(false);
    }
  }, [displayPoi, isAuthenticated, isTogglingFavorite]);

  const handleReportStatus = async (statusType: string) => {
    if (!displayPoi) return;
    if (!isAuthenticated) {
      notify.error("请先登录后再上报情报");
      router.push("/login");
      return;
    }
    if (isInCooldown) return;

    const targetPoi = selectedSubPOI ?? poi ?? activePOI;
    if (targetPoi) {
      analytics.poi.statusReportSubmit({ poi_id: targetPoi.id, status_type: statusType });
    }

    const optimisticId = `${OPTIMISTIC_ID_PREFIX}${statusType}-${Date.now()}`;
    const optimisticStatus: LiveStatusItem = {
      id: optimisticId,
      statusType,
      description: null,
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
        notify.success("感谢您的情报！人流情报 20 分钟有效，事件/状态 8 小时有效");
        const refresh = await getActiveStatusesByPoi(displayPoi.id, schoolId);
        if (refresh.success && refresh.data) {
          setActiveLiveStatuses(refresh.data);
        }
        onStatusUpdate?.();
      } else {
        setActiveLiveStatuses((prev) => prev.filter((s) => s.id !== optimisticId));
        notify.error(result.error ?? "上报失败");
      }
    } catch {
      setActiveLiveStatuses((prev) => prev.filter((s) => s.id !== optimisticId));
      notify.error("上报失败，请重试");
    } finally {
      setReportingStatusType(null);
    }
  };

  const handleReport = async () => {
    if (!displayPoi) return;
    if (!isAuthenticated) {
      notify.error("请先登录后再举报");
      router.push("/login");
      return;
    }
    if (!reportReason) {
      notify.error("请选择举报原因");
      return;
    }

    setIsReporting(true);

    try {
      const { reportPOI } = await import("@/lib/actions/poi");
      const result = await reportPOI(
        displayPoi.id,
        reportReason,
        reportDescription || undefined
      );

      if (!result.success) {
        throw new Error(result.error || "举报失败");
      }

      notify.success("举报成功，感谢您的反馈！");
      setShowReportModal(false);
      setReportReason("");
      setReportDescription("");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "举报失败，请重试");
    } finally {
      setIsReporting(false);
    }
  };

  if (!displayPoi) return null;

  const CategoryIcon = getCategoryIcon(displayPoi.category);

  return {
    displayPoi,
    isSubPoiView,
    poiWithChildren,
    CategoryIcon,
    schoolId,
    isOpen,
    userLocation,
    onSelectLostFoundItem,
    selectedSubPOI,
    handleClose,
    selectSubPOI,
    setEndPoint,
    setStartPoint,
    startNavigation,
    openNavigationPanel,
    setHighlightPoi,
    highlightTimeoutRef,
    isInCooldown,
    isLoadingLiveStatuses,
    activeLiveStatuses,
    reportingStatusType,
    onReportStatus: handleReportStatus,
    activeActivities,
    selectedActivity,
    setSelectedActivity,
    activeLostFound,
    setActiveLostFound,
    setShowLostFoundForm,
    showLostFoundForm,
    showLostFoundExpiredPlaceholder,
    getActiveLostFoundByPoi,
    setShowReportModal,
    showReportModal,
    reportReason,
    setReportReason,
    reportDescription,
    setReportDescription,
    isReporting,
    handleReport,
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
    profileModalUserId,
    onReplyClick: handleReplyClick,
    onLikeClick: handleLikeClick,
    onCommentSubmit: handleCommentSubmit,
    isSubmittingComment,
    isAuthenticated,
    currentUser,
    fetchComments,
    isFavorited,
    isTogglingFavorite,
    onToggleFavorite: handleToggleFavorite,
  };
}
