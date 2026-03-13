import { create } from "zustand";
import type { POIWithStatus } from "@/lib/poi-utils";

interface MapSearchState {
  pois: POIWithStatus[];
  onSelectPOI: ((poi: POIWithStatus) => void) | null;
  /** 用户当前位置 [lng, lat]，用于搜索结果按距离排序 */
  userLocation: [number, number] | null;
  setMapSearch: (pois: POIWithStatus[], onSelectPOI: ((poi: POIWithStatus) => void) | null) => void;
  setUserLocation: (location: [number, number] | null) => void;
}

/**
 * 地图搜索状态（供 Navbar 中的 POI 搜索条使用）
 * 首页在加载 POI 后调用 setMapSearch，离开时清空
 */
export const useMapSearchStore = create<MapSearchState>((set) => ({
  pois: [],
  onSelectPOI: null,
  userLocation: null,

  setMapSearch: (pois, onSelectPOI) => {
    set({ pois, onSelectPOI });
  },

  setUserLocation: (location) => {
    set({ userLocation: location });
  },
}));
