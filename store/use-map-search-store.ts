import { create } from "zustand";
import type { POIWithStatus } from "@/lib/poi-utils";

interface MapSearchState {
  pois: POIWithStatus[];
  onSelectPOI: ((poi: POIWithStatus) => void) | null;
  setMapSearch: (pois: POIWithStatus[], onSelectPOI: ((poi: POIWithStatus) => void) | null) => void;
}

/**
 * 地图搜索状态（供 Navbar 中的 POI 搜索条使用）
 * 首页在加载 POI 后调用 setMapSearch，离开时清空
 */
export const useMapSearchStore = create<MapSearchState>((set) => ({
  pois: [],
  onSelectPOI: null,

  setMapSearch: (pois, onSelectPOI) => {
    set({ pois, onSelectPOI });
  },
}));
