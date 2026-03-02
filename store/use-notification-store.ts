import { create } from "zustand";
import {
  getUnreadNotificationCount,
  getUnreadNotificationCounts,
  type UnreadCounts,
} from "@/lib/notification-actions";

interface NotificationState {
  unreadCount: number;
  marketUnread: number;
  messagesUnread: number;
  setUnreadCount: (count: number) => void;
  setUnreadCounts: (counts: Partial<UnreadCounts>) => void;
  fetchUnreadCount: (userId: string) => Promise<void>;
  fetchUnreadCounts: (userId: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  marketUnread: 0,
  messagesUnread: 0,

  setUnreadCount: (count) => set({ unreadCount: count }),

  setUnreadCounts: (counts) =>
    set((s) => ({
      unreadCount: counts.total ?? s.unreadCount,
      marketUnread: counts.market ?? s.marketUnread,
      messagesUnread: counts.messages ?? s.messagesUnread,
    })),

  fetchUnreadCount: async (userId) => {
    const result = await getUnreadNotificationCount(userId);
    if (result.success && result.data !== undefined) {
      set({ unreadCount: result.data });
    }
  },

  fetchUnreadCounts: async (userId) => {
    const result = await getUnreadNotificationCounts(userId);
    if (result.success && result.data) {
      set({
        unreadCount: result.data.total,
        marketUnread: result.data.market,
        messagesUnread: result.data.messages,
      });
    }
  },
}));
