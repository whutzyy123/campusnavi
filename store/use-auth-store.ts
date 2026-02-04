import { create } from "zustand";

export type UserRole = "STUDENT" | "ADMIN" | "STAFF" | "SUPER_ADMIN";

export interface User {
  id: string;
  email?: string;
  nickname: string;
  bio?: string; // 个人简介
  role: UserRole;
  schoolId: string | null; // 可选：超级管理员为 null
  schoolName?: string | null;
}

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean; // 是否已完成初始化（获取用户信息）
  setUser: (user: User | null) => void;
  clearUser: () => void;
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

  setInitialized: (initialized: boolean) => {
    set({ isInitialized: initialized });
  },

  initializeAuth: async () => {
    // 如果已经初始化过，不再重复初始化
    if (get().isInitialized) {
      return;
    }

    try {
      const response = await fetch("/api/auth/me");

      // 非 2xx（如 401/405）时，视为未登录
      if (!response.ok) {
        set({
          currentUser: null,
          isAuthenticated: false,
          isInitialized: true, // 即使失败也标记为已初始化
        });
        return;
      }

      const data = await response.json();
      if (data.success && data.user) {
        set({
          currentUser: data.user,
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

