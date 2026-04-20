import { create } from "zustand";
import { logoutUser, getMe, type MeUser } from "@/lib/auth-server-actions";
import { useNotificationStore } from "@/store/use-notification-store";

export type UserRole = "STUDENT" | "ADMIN" | "STAFF" | "SUPER_ADMIN";

/** 与 getMe / /api/auth/me 对齐的客户端用户快照 */
export type User = MeUser;

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean; // 是否已完成初始化（获取用户信息）
  isLoggingOut: boolean; // 登出中（防止重复点击、显示加载态）
  setUser: (user: User | null) => void;
  clearUser: () => void;
  /** 立即清空认证状态（用户 + 通知），用于登出时先停止受保护 UI 渲染 */
  clearAuth: () => void;
  /** 登出：clearAuth → Server Action；失败时 POST /api/auth/logout 清 Cookie 后跳转登录 */
  logout: () => Promise<void>;
  /** 从服务端同步用户；force为 true 时忽略「已初始化」短路（登录成功、资料更新后使用） */
  initializeAuth: (opts?: { force?: boolean }) => Promise<void>;
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
    set({ currentUser: null, isAuthenticated: false, isInitialized: false });
    useNotificationStore.getState().setUnreadCount(0);
  },

  logout: async () => {
    get().clearAuth();
    set({ isLoggingOut: true });
    try {
      await logoutUser();
    } catch (e) {
      if (e instanceof Error && e.message?.includes?.("NEXT_REDIRECT")) throw e;
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        /*忽略网络错误，仍跳转登录页 */
      }
      window.location.href = "/login";
      return;
    }
    window.location.href = "/login";
  },

  setInitialized: (initialized: boolean) => {
    set({ isInitialized: initialized });
  },

  initializeAuth: async (opts?: { force?: boolean }) => {
    if (!opts?.force && get().isInitialized) {
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

