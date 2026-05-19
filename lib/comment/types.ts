/**
 * 留言相关类型定义
 */

/** 快捷回复结果 */
export interface SubmitQuickReplyResult {
  success: boolean;
  error?: string;
}

/** 切换点赞结果 */
export interface ToggleLikeResult {
  success: boolean;
  isLiked?: boolean;
  newCount?: number;
  error?: string;
}

/** POI 留言列表项（用户端） */
export interface POICommentListItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  reportCount: number;
  isHidden: boolean;
  parentId: string | null;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    email?: string | null;
  };
  parent: {
    id: string;
    user: { id: string; nickname: string | null };
  } | null;
}

/** POI 留言树节点（客户端展示，含嵌套 replies） */
export type CommentItem = POICommentListItem & {
  replies?: CommentItem[];
};

/** 获取 POI 留言列表结果 */
export interface GetPOICommentsResult {
  success: boolean;
  comments?: POICommentListItem[];
  pagination?: { page: number; limit: number; total: number };
  error?: string;
}

/** 创建留言结果 */
export interface CreateCommentResult {
  success: boolean;
  comment?: {
    id: string;
    content: string;
    createdAt: string;
    reportCount: number;
    isHidden: boolean;
    parentId: string | null;
    user: { id: string; nickname: string | null; avatar: string | null };
    parent: {
      id: string;
      user: { id: string; nickname: string | null };
    } | null;
  };
  error?: string;
}

/** 删除留言结果（用户自删或管理员删） */
export interface DeleteCommentResult {
  success: boolean;
  error?: string;
}

/** 举报留言结果 */
export interface ReportCommentResult {
  success: boolean;
  reportCount?: number;
  isHidden?: boolean;
  isAutoHidden?: boolean;
  message?: string;
  error?: string;
}

/** 审核留言列表项 */
export interface AuditCommentItem {
  id: string;
  content: string;
  createdAt: string;
  reportCount: number;
  isHidden: boolean;
  isReviewed: boolean;
  reviewedAt: string | null;
  reviewer: { id: string; nickname: string | null; email: string | null } | null;
  user: { id: string; nickname: string | null; email: string | null; avatar: string | null };
  poi: { id: string; name: string; category: string };
}

/** 审核留言数量 */
export interface AuditCommentCountsResult {
  success: boolean;
  pending?: number;
  processed?: number;
  error?: string;
}

/** 学校留言管理查询参数 */
export interface GetSchoolCommentsParams {
  poiId?: string | null;
  userId?: string | null;
  status?: "visible" | "hidden" | null;
  isReviewed?: boolean | null;
  search?: string | null;
  page?: number;
  limit?: number;
}

/** 学校留言列表项 */
export interface SchoolCommentItem {
  id: string;
  content: string;
  createdAt: string;
  isHidden: boolean;
  isReviewed: boolean;
  reportCount: number;
  likeCount: number;
  parentId: string | null;
  user: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  poi: { id: string; name: string; category: string | null };
}

/** 学校留言列表返回 */
export interface GetSchoolCommentsResult {
  success: boolean;
  data?: SchoolCommentItem[];
  pagination?: { total: number; pageCount: number; currentPage: number; limit: number };
  error?: string;
}

/** 学校留言详情（含父留言） */
export interface SchoolCommentDetailItem extends SchoolCommentItem {
  parent?: {
    id: string;
    content: string;
    createdAt: string;
    isHidden: boolean;
    user: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  } | null;
}

/** 学校留言详情返回 */
export interface GetSchoolCommentDetailResult {
  success: boolean;
  data?: SchoolCommentDetailItem;
  error?: string;
}

/** 审核留言列表返回 */
export interface GetAuditCommentsResult {
  success: boolean;
  data?: AuditCommentItem[];
  pagination?: { total: number; pageCount: number; currentPage: number };
  error?: string;
}

/** 审核操作结果 */
export interface ReviewCommentResult {
  success: boolean;
  error?: string;
}

/** 永久删除结果 */
export interface HardDeleteCommentResult {
  success: boolean;
  error?: string;
}

/** 批量永久删除结果 */
export interface HardDeleteCommentsResult {
  success: boolean;
  deleted?: number;
  error?: string;
}
