/**
 * POI Drawer 类型定义
 */

import type { User } from "@/store/use-auth-store";
import type { POIWithStatus } from "@/lib/geo/poi-utils";

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

/** 子 POI 结构（来自 getPOIDetail / POI 详情） */
export interface SubPOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  description?: string | null;
  imageUrl?: string | null;
}

/** POI Drawer Props */
export interface POIDrawerProps {
  poi: POIWithStatus | null;
  schoolId: string;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: () => void;
  userLocation?: [number, number];
  /** 从 URL 传入的 commentId，用于滚动并高亮该留言 */
  highlightCommentId?: string;
  /** 从 URL 传入的 lostFoundId，用于 deep link；若已过期则显示占位提示 */
  highlightLostFoundId?: string;
  /** 点击失物招领卡片时调用，用于打开详情弹窗（由父级管理） */
  onSelectLostFoundItem?: (item: LostFoundItemForSelect) => void;
  /** 父级刷新失物招领列表时递增，触发 drawer 内重新拉取 */
  lostFoundListRefreshTrigger?: number;
}

/** 实时状态项 */
export interface LiveStatusItem {
  id: string;
  statusType: string;
  description: string | null;
  upvotes: number;
  createdAt: string;
}

/** 活动项 */
export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  link: string | null;
  startAt: string;
  endAt: string;
}

/** 失物招领项 */
export interface LostFoundItem {
  id: string;
  description: string;
  images: string[];
  contactInfo: string | null;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null };
}

/** 状态上报按钮配置 */
export interface StatusButtonConfig {
  id: string;
  label: string;
  emoji: string;
  className: string;
}

/** 状态徽章配置 */
export interface StatusBadgeConfig {
  label: string;
  emoji: string;
  className: string;
}

/** 分组后的状态 */
export interface GroupedStatus {
  statusType: string;
  count: number;
  latestCreatedAt: string;
}

/** 评论项（canonical：lib/comment/types.ts） */
export type { CommentItem } from "@/lib/comment/types";
