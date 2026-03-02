"use server";

/**
 * 通知系统 Server Actions
 * 创建、获取、标记已读
 */

import { prisma } from "@/lib/prisma";
import { NotificationType, NotificationEntityType } from "@prisma/client";

export interface NotificationItem {
  id: string;
  type: string;
  entityId: string | null;
  entityType: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
  actor: {
    id: string;
    nickname: string | null;
    avatar: string | null;
  } | null;
  /** COMMENT 类型时：关联的 POI ID，用于「查看地点」跳转 */
  poiId?: string | null;
  /** COMMENT 类型时：留言 ID（entityId），用于快捷回复的 parentId */
  commentId?: string | null;
  /** 分组点赞：用于标记整组已读的原始通知 ID 列表 */
  notificationIds?: string[];
  /** 分组点赞：前 2 个点赞者昵称 */
  actorNames?: string[];
  /** 分组点赞：点赞总人数 */
  totalActorCount?: number;
  /** 被点赞/被回复的原始留言内容 */
  originalCommentContent?: string | null;
  /** 回复通知：回复者的回复内容 */
  replyContent?: string | null;
}

export interface NotificationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 创建通知（可复用工具函数）
 * @param userId 接收者 ID
 * @param actorId 触发者 ID（可选，系统消息无 actor）
 * @param type 通知类型
 * @param entityId 关联实体 ID（可选）
 * @param entityType 关联实体类型
 * @param message 短预览或系统消息（可选）
 */
export async function createNotification(
  userId: string,
  actorId: string | null,
  type: NotificationType,
  entityId: string | null,
  entityType: NotificationEntityType,
  message: string | null
): Promise<void> {
  try {
    // 不给自己发通知
    if (actorId && userId === actorId) return;

    await prisma.notification.create({
      data: {
        userId,
        actorId,
        type,
        entityId,
        entityType,
        message: message && message.length > 500 ? message.slice(0, 500) : message,
      },
    });
  } catch (err) {
    console.error("[createNotification]", err);
  }
}

/** 分类未读数量 */
export interface UnreadCounts {
  total: number;
  market: number;
  messages: number;
}

/**
 * 获取用户未读通知数量（总数）
 */
export async function getUnreadNotificationCount(
  userId: string
): Promise<NotificationResult<number>> {
  try {
    const result = await getUnreadNotificationCounts(userId);
    if (!result.success || result.data === undefined) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data.total };
  } catch (err) {
    console.error("[getUnreadNotificationCount]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取未读数失败",
    };
  }
}

/**
 * 获取用户分类未读通知数量
 * - market: 生存集市相关（entityType MARKET_ITEM）
 * - messages: 社交消息（COMMENT 点赞/回复、LOST_FOUND 失物已找到、POI 等）
 */
export async function getUnreadNotificationCounts(
  userId: string
): Promise<NotificationResult<UnreadCounts>> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "userId 为必填项" };
    }

    const uid = userId.trim();
    const baseWhere = { userId: uid, isRead: false };

    const [total, market, messages] = await Promise.all([
      prisma.notification.count({ where: baseWhere }),
      prisma.notification.count({
        where: { ...baseWhere, entityType: "MARKET_ITEM" },
      }),
      prisma.notification.count({
        where: {
          ...baseWhere,
          entityType: { in: ["COMMENT", "LOST_FOUND", "POI"] },
        },
      }),
    ]);

    return {
      success: true,
      data: { total, market, messages },
    };
  } catch (err) {
    console.error("[getUnreadNotificationCounts]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取未读数失败",
    };
  }
}

/**
 * 获取用户通知列表（聚合点赞 + 内容增强）
 * - LIKE：按 entityId（留言 ID）分组，返回 actorNames、totalActorCount、originalCommentContent
 * - REPLY：增强 originalCommentContent、replyContent
 * - 按 createdAt 倒序，支持分页
 */
/**
 * 获取用户集市相关通知（仅 entityType MARKET_ITEM），用于中控台「集市交易」Tab 侧边栏
 */
export async function getUserMarketNotifications(
  userId: string,
  limit: number = 30
): Promise<NotificationResult<NotificationItem[]>> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "userId 为必填项" };
    }
    const notifications = await prisma.notification.findMany({
      where: { userId: userId.trim(), entityType: "MARKET_ITEM" },
      include: {
        actor: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const items: NotificationItem[] = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      entityId: n.entityId,
      entityType: n.entityType,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      actor: n.actor
        ? { id: n.actor.id, nickname: n.actor.nickname, avatar: n.actor.avatar }
        : null,
    }));
    return { success: true, data: items };
  } catch (err) {
    console.error("[getUserMarketNotifications]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取交易动态失败",
    };
  }
}

export async function getUserNotifications(
  userId: string,
  limit: number = 20,
  excludeEntityTypes?: string[]
): Promise<NotificationResult<NotificationItem[]>> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "userId 为必填项" };
    }

    const uid = userId.trim();
    // 多取一些以应对分组后数量减少
    const fetchLimit = Math.min(limit * 3, 100);
    const notifications = await prisma.notification.findMany({
      where: { userId: uid },
      include: {
        actor: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
    });

    // 分离 COMMENT 类型的 LIKE 与 REPLY
    const likeNotifications = notifications.filter(
      (n) => n.entityType === "COMMENT" && n.type === "LIKE" && n.entityId
    );
    const replyNotifications = notifications.filter(
      (n) => n.entityType === "COMMENT" && n.type === "REPLY" && n.entityId
    );
    const otherNotifications = notifications.filter(
      (n) =>
        n.entityType !== "COMMENT" ||
        (n.type !== "LIKE" && n.type !== "REPLY") ||
        !n.entityId
    );

    // 按 entityId 分组 LIKE
    type NotifWithActor = (typeof notifications)[number];
    const likeGroups = new Map<string, NotifWithActor[]>();
    for (const n of likeNotifications) {
      const list = likeGroups.get(n.entityId!) ?? [];
      list.push(n as NotifWithActor);
      likeGroups.set(n.entityId!, list);
    }

    // 需要获取内容的 Comment ID（含其他 COMMENT 类型以解析 poiId）
    const likeCommentIds = [...likeGroups.keys()];
    const replyCommentIds = replyNotifications.map((n) => n.entityId!);
    const otherCommentIds = otherNotifications
      .filter((n) => n.entityType === "COMMENT" && n.entityId)
      .map((n) => n.entityId!);
    const allCommentIds = [
      ...new Set([
        ...likeCommentIds,
        ...replyCommentIds,
        ...otherCommentIds,
      ]),
    ];

    // 批量获取 Comment：id, poiId, content, parentId
    const commentMap = new Map<
      string,
      { poiId: string; content: string; parentId: string | null }
    >();
    if (allCommentIds.length > 0) {
      const comments = await prisma.comment.findMany({
        where: { id: { in: allCommentIds } },
        select: { id: true, poiId: true, content: true, parentId: true },
      });
      comments.forEach((c) =>
        commentMap.set(c.id, {
          poiId: c.poiId,
          content: c.content,
          parentId: c.parentId,
        })
      );
    }

    // 获取父留言内容（用于 REPLY 的 originalCommentContent）
    const parentIds = [...commentMap.values()]
      .map((c) => c.parentId)
      .filter((id): id is string => !!id);
    const parentCommentMap = new Map<string, string>();
    if (parentIds.length > 0) {
      const parents = await prisma.comment.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, content: true },
      });
      parents.forEach((p) => parentCommentMap.set(p.id, p.content));
    }

    // LOST_FOUND poiId
    const lostFoundIds = notifications
      .filter((n) => n.entityType === "LOST_FOUND" && n.entityId)
      .map((n) => n.entityId!);
    const lostFoundPoiMap = new Map<string, string>();
    if (lostFoundIds.length > 0) {
      const events = await prisma.lostFoundEvent.findMany({
        where: { id: { in: lostFoundIds } },
        select: { id: true, poiId: true },
      });
      events.forEach((e) => lostFoundPoiMap.set(e.id, e.poiId));
    }

    // 构建分组后的 LIKE 通知
    const groupedLikeItems: NotificationItem[] = [];
    for (const [entityId, group] of likeGroups) {
      const sorted = [...group].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      const latest = sorted[0];
      const isRead = group.every((n) => n.isRead);
      const seen = new Set<string>();
      const actorNames = group
        .map((n) => n.actor?.nickname || "匿名用户")
        .filter((name) => {
          if (seen.has(name)) return false;
          seen.add(name);
          return true;
        })
        .slice(0, 2);
      const commentInfo = commentMap.get(entityId);
      groupedLikeItems.push({
        id: latest.id,
        type: "LIKE",
        entityId,
        entityType: "COMMENT",
        message: null,
        isRead,
        createdAt: latest.createdAt.toISOString(),
        actor: latest.actor
          ? {
              id: latest.actor.id,
              nickname: latest.actor.nickname,
              avatar: latest.actor.avatar,
            }
          : null,
        poiId: commentInfo?.poiId ?? null,
        commentId: entityId,
        notificationIds: group.map((n) => n.id),
        actorNames: actorNames.length > 0 ? actorNames : ["匿名用户"],
        totalActorCount: group.length,
        originalCommentContent: commentInfo?.content ?? null,
      });
    }

    // 构建增强后的 REPLY 通知
    const enrichedReplyItems: NotificationItem[] = replyNotifications.map(
      (n) => {
        const commentInfo = commentMap.get(n.entityId!);
        const poiId = commentInfo?.poiId ?? null;
        const replyContent = commentInfo?.content ?? null;
        const parentId = commentInfo?.parentId ?? null;
        const originalCommentContent = parentId
          ? parentCommentMap.get(parentId) ?? null
          : null;
        return {
          id: n.id,
          type: "REPLY",
          entityId: n.entityId,
          entityType: n.entityType,
          message: n.message,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
          actor: n.actor
            ? {
                id: n.actor.id,
                nickname: n.actor.nickname,
                avatar: n.actor.avatar,
              }
            : null,
          poiId,
          commentId: n.entityId,
          originalCommentContent,
          replyContent,
        };
      }
    );

    // 构建其他类型通知（含 poiId）
    const otherItems: NotificationItem[] = otherNotifications.map((n) => {
      let poiId: string | null = null;
      if (n.entityType === "COMMENT" && n.entityId) {
        poiId = commentMap.get(n.entityId)?.poiId ?? null;
      } else if (n.entityType === "LOST_FOUND" && n.entityId) {
        poiId = lostFoundPoiMap.get(n.entityId) ?? null;
      } else if (n.entityType === "POI" && n.entityId) {
        poiId = n.entityId;
      }
      return {
        id: n.id,
        type: n.type,
        entityId: n.entityId,
        entityType: n.entityType,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
        actor: n.actor
          ? {
              id: n.actor.id,
              nickname: n.actor.nickname,
              avatar: n.actor.avatar,
            }
          : null,
        poiId,
        commentId: n.entityType === "COMMENT" && n.entityId ? n.entityId : null,
      };
    });

    // 合并并按时间排序，取前 limit 条
    const merged = [
      ...groupedLikeItems,
      ...enrichedReplyItems,
      ...otherItems,
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const filtered =
      excludeEntityTypes?.length
        ? merged.filter((n) => !excludeEntityTypes.includes(n.entityType))
        : merged;
    const result = filtered.slice(0, limit);

    return { success: true, data: result };
  } catch (err) {
    console.error("[getUserNotifications]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "获取通知失败",
    };
  }
}

/**
 * 标记单条通知为已读
 */
export async function markAsRead(
  notificationId: string
): Promise<NotificationResult<void>> {
  try {
    if (!notificationId?.trim()) {
      return { success: false, error: "notificationId 为必填项" };
    }

    await prisma.notification.update({
      where: { id: notificationId.trim() },
      data: { isRead: true },
    });

    return { success: true };
  } catch (err) {
    console.error("[markAsRead]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/**
 * 批量标记通知为已读（用于分组点赞等场景）
 */
export async function markAsReadMultiple(
  notificationIds: string[]
): Promise<NotificationResult<void>> {
  try {
    const ids = notificationIds.filter((id) => id?.trim());
    if (ids.length === 0) return { success: true };

    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { isRead: true },
    });

    return { success: true };
  } catch (err) {
    console.error("[markAsReadMultiple]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/**
 * 标记用户所有未读通知为已读
 */
export async function markAllAsRead(
  userId: string
): Promise<NotificationResult<void>> {
  try {
    if (!userId?.trim()) {
      return { success: false, error: "userId 为必填项" };
    }

    await prisma.notification.updateMany({
      where: { userId: userId.trim(), isRead: false },
      data: { isRead: true },
    });

    return { success: true };
  } catch (err) {
    console.error("[markAllAsRead]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

/**
 * 按实体类型标记未读通知为已读（用于 Tab 切换时）
 * @param userId 用户 ID
 * @param entityTypes 要标记的实体类型，如 ["MARKET_ITEM"] 或 ["COMMENT","LOST_FOUND","POI"]
 */
export async function markAsReadByEntityTypes(
  userId: string,
  entityTypes: string[]
): Promise<NotificationResult<void>> {
  try {
    if (!userId?.trim() || entityTypes.length === 0) {
      return { success: true };
    }

    await prisma.notification.updateMany({
      where: {
        userId: userId.trim(),
        isRead: false,
        entityType: { in: entityTypes as NotificationEntityType[] },
      },
      data: { isRead: true },
    });

    return { success: true };
  } catch (err) {
    console.error("[markAsReadByEntityTypes]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}
