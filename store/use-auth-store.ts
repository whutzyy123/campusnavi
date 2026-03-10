import { create } from "zustand";
import { logoutUser, getMe } from "@/lib/auth-server-actions";
import { useNotificationStore } from "@/store/use-notification-store";

export type UserRole = "STUDENT" | "ADMIN" | "STAFF" | "SUPER_ADMIN";

export interface User {
  id: string;
  email?: string | null;
  nickname: string | null;
  bio?: string | null;
  avatar?: string | null;
  lastProfileUpdateAt?: string | null;
  role: UserRole | string; // 兼容 getMe 返回的 string
  schoolId: string | null;
  schoolName?: string | null;
}

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean; // 是否已完成初始化（获取用户信息）
  isLoggingOut: boolean; // 登出中（防止重复点击、显示加载态）
  setUser: (user: User | null) => void;
  clearUser: () => void;
  /** 立即清空认证状态（用户 + 通知），用于登出时先停止受保护 UI 渲染 */
  clearAuth: () => void;
  /** 登出：clearAuth → Server Action → 失败时 window.location 兜底 */
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>; // 初始化认证状态
  setInitialized: (initialized: boolean) => void; // 设置初始化状态
}

/**
 * 用户认证状态管理 Store（仅内存状态）
 * 认证状态由 HTTP Only Cookie 管理，这里只用于客户端 UI 状态
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoggingOut: false,

  setUser: (user) => {
    set({
      currentUser: user,
      isAuthenticated: !!user,
    });
  },

  clearUser: () => {
    set({
      currentUser: null,
      isAuthenticated: false,
    });
  },

  clearAuth: () => {
    set({ currentUser: null, isAuthenticated: false });
    useNotificationStore.getState().setUnreadCount(0);
  },

  logout: async () => {
    get().clearAuth();
    set({ isLoggingOut: true });
    try {
      await logoutUser();
    } catch (e) {
      if (e instanceof Error && e.message?.includes?.("NEXT_REDIRECT")) throw e;
      window.location.href = "/login";
      return;
    }
    window.location.href = "/login";
  },

  setInitialized: (initialized: boolean) => {
    set({ isInitialized: initialized });
  },

  initializeAuth: async () => {
    // 如果已经初始化过，不再重复初始化
    if (get().isInitialized) {
      return;
    }

    try {
      const result = await getMe();
      if (result.success && result.user) {
        set({
          currentUser: result.user,
          isAuthenticated: true,
          isInitialized: true,
        });
      } else {
        set({
          currentUser: null,
          isAuthenticated: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error("获取用户信息失败:", error);
      set({
        currentUser: null,
        isAuthenticated: false,
        isInitialized: true, // 即使失败也标记为已初始化
      });
    }
  },
}));

