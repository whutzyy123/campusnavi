/**
 * 导航状态管理 Store
 * 管理路线规划、导航信息等状态
 */

import { create } from "zustand";

export interface RouteInfo {
  distance: number; // 距离（米）
  duration: number; // 预计时间（分钟）
  path: [number, number][]; // 路径点坐标数组
}

export interface RouteStep {
  instruction: string;
  distance: number; // 米
}

export interface NavPoint {
  lng: number;
  lat: number;
  name?: string;
}

export interface NavigationState {
  // 导航点与结果
  startPoint: NavPoint | null;
  endPoint: NavPoint | null;
  isNavigating: boolean;
  routeInfo: RouteInfo | null;
  routeSteps: RouteStep[];

  // 交互状态：当前是否在选择起点/终点（用于地图点选）
  selectMode: "start" | "end" | null;

  // Actions
  setStartPoint: (point: NavPoint | null) => void;
  setEndPoint: (point: NavPoint | null) => void;
  setSelectMode: (mode: "start" | "end" | null) => void;
  startNavigation: () => void;
  clearNavigation: () => void;
  swapPoints: () => void;
  stopNavigation: () => void;
  updateRouteInfo: (routeInfo: RouteInfo) => void;
  setRouteSteps: (steps: RouteStep[]) => void;
}

/**
 * 导航状态管理
 */
export const useNavigationStore = create<NavigationState>((set, get) => ({
  startPoint: null,
  endPoint: null,
  isNavigating: false,
  routeInfo: null,
  routeSteps: [],
  selectMode: null,

  setStartPoint: (point) => set({ startPoint: point }),

  setEndPoint: (point) => set({ endPoint: point }),

  setSelectMode: (mode) => set({ selectMode: mode }),

  startNavigation: () => {
    const { startPoint, endPoint } = get();
    if (!startPoint && !endPoint) return;
    set({ isNavigating: true });
  },

  clearNavigation: () => {
    set({
      startPoint: null,
      endPoint: null,
      isNavigating: false,
      routeInfo: null,
      selectMode: null,
    });
  },

  swapPoints: () => {
    set((state) => ({
      startPoint: state.endPoint,
      endPoint: state.startPoint,
    }));
  },

  stopNavigation: () => {
    set({
      isNavigating: false,
      routeInfo: null,
      selectMode: null,
    });
  },

  updateRouteInfo: (routeInfo) => {
    set((state) => ({
      routeInfo: state.isNavigating ? routeInfo : state.routeInfo,
    }));
  },

  setRouteSteps: (steps) => {
    set((state) => ({
      routeSteps: state.isNavigating ? steps : state.routeSteps,
    }));
  },
}));

