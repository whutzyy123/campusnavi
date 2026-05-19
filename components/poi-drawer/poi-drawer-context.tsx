"use client";

import { createContext, useContext, type ComponentType, type MutableRefObject, type RefObject } from "react";
import type { User } from "@/store/use-auth-store";
import type { POIWithStatus } from "@/lib/geo/poi-utils";
import type {
  ActivityItem,
  LiveStatusItem,
  LostFoundItem,
  LostFoundItemForSelect,
  SubPOI,
} from "@/lib/poi-drawer/types";
import type { CommentItem } from "@/components/poi-drawer/poi-comment-block";
import { getActiveLostFoundByPoi } from "@/lib/actions/lost-found";

export interface PoiDrawerContextValue {
  displayPoi: POIWithStatus;
  isSubPoiView: boolean;
  poiWithChildren: (POIWithStatus & { children?: SubPOI[] }) | null;
  CategoryIcon: ComponentType<{ className?: string }>;
  schoolId: string;
  isOpen: boolean;
  userLocation?: [number, number];
  onSelectLostFoundItem?: (item: LostFoundItemForSelect) => void;
  selectedSubPOI: POIWithStatus | null;

  handleClose: () => void;
  selectSubPOI: (poi: POIWithStatus | null) => void;
  setEndPoint: (p: { lng: number; lat: number; name: string }) => void;
  setStartPoint: (p: { lng: number; lat: number; name: string }) => void;
  startNavigation: () => void;
  openNavigationPanel: () => void;
  setHighlightPoi: (id: string | null) => void;
  highlightTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;

  isInCooldown: boolean;
  isLoadingLiveStatuses: boolean;
  activeLiveStatuses: LiveStatusItem[];
  reportingStatusType: string | null;
  onReportStatus: (statusType: string) => void;

  activeActivities: ActivityItem[];
  selectedActivity: ActivityItem | null;
  setSelectedActivity: (a: ActivityItem | null) => void;

  activeLostFound: LostFoundItem[];
  setActiveLostFound: React.Dispatch<React.SetStateAction<LostFoundItem[]>>;
  setShowLostFoundForm: (v: boolean) => void;
  showLostFoundForm: boolean;
  showLostFoundExpiredPlaceholder: boolean;
  getActiveLostFoundByPoi: typeof getActiveLostFoundByPoi;

  setShowReportModal: (v: boolean) => void;
  showReportModal: boolean;
  reportReason: string;
  setReportReason: (v: string) => void;
  reportDescription: string;
  setReportDescription: (v: string) => void;
  isReporting: boolean;
  handleReport: () => Promise<void>;

  comments: CommentItem[];
  isLoadingComments: boolean;
  sortBy: "latest" | "popular";
  setSortBy: (v: "latest" | "popular") => void;
  totalCommentCount: number;
  newComment: string;
  setNewComment: (v: string) => void;
  replyingTo: { id: string; name: string } | null;
  setReplyingTo: (v: { id: string; name: string } | null) => void;
  commentInputRef: RefObject<HTMLTextAreaElement | null>;
  highlightedCommentId: string | null;
  setProfileModalUserId: (v: string | null) => void;
  profileModalUserId: string | null;
  onReplyClick: (comment: CommentItem) => void;
  onLikeClick: (commentId: string) => void | Promise<void>;
  onCommentSubmit: () => void;
  isSubmittingComment: boolean;
  isAuthenticated: boolean;
  currentUser: User | null;
  fetchComments: (sort?: "latest" | "popular") => void;

  isFavorited: boolean;
  isTogglingFavorite: boolean;
  onToggleFavorite: () => void;
}

const PoiDrawerContext = createContext<PoiDrawerContextValue | null>(null);

export function PoiDrawerProvider({
  value,
  children,
}: {
  value: PoiDrawerContextValue;
  children: React.ReactNode;
}) {
  return (
    <PoiDrawerContext.Provider value={value}>{children}</PoiDrawerContext.Provider>
  );
}

export function usePoiDrawerContext(): PoiDrawerContextValue {
  const ctx = useContext(PoiDrawerContext);
  if (!ctx) {
    throw new Error("usePoiDrawerContext must be used within PoiDrawerProvider");
  }
  return ctx;
}
