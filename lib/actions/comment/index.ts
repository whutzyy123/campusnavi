/**
 * 留言 Server Actions 统一导出
 */

// 类型
export * from "@/lib/comment/types";

// 用户端列表
export { getPOIComments } from "./list";

// 用户端写入
export { createComment, submitQuickReply, notifyCommentReply } from "./write";

// 用户端交互
export { toggleCommentLike, deleteComment, reportComment } from "./interact";

// 管理端列表
export { getSchoolComments, getSchoolCommentDetail } from "./admin-list";

// 审核功能
export { getAuditCommentCounts, getAuditComments, reviewComment } from "./audit";

// 永久删除
export { hardDeleteComment, hardDeleteComments } from "./delete";