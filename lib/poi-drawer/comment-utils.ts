/**
 * POI Drawer 评论树工具函数
 */

import type { CommentItem } from "@/lib/comment/types";

/**
 * 将平铺的留言数组转换为树形结构
 * @param flatComments 平铺的留言数组
 * @returns 树形结构的留言数组（只包含顶级留言，子回复在 replies 中）
 */
export function buildCommentTree(flatComments: CommentItem[]): CommentItem[] {
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
export function findCommentInTree(comments: CommentItem[], commentId: string): CommentItem | null {
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
export function updateCommentInTree(
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