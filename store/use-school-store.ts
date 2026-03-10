import { create } from "zustand";
import type { POIWithStatus } from "@/lib/poi-utils";

export interface School {
  id: string;
  name: string;
  schoolCode: string;
  centerLat?: number | null;
  centerLng?: number | null;
}

export interface HighlightSubPOI {
  lat: number;
  lng: number;
  name: string;
}

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

/** 校区聚焦载荷：用于地图平移到指定校区 */
export interface FocusCampusPayload {
  center: [number, number];
  boundary?: { type: string; coordinates?: number[][][] };
}

interface SchoolState {
  activeSchool: School | null;
  inspectedSchool: School | null; // 超级管理员临时视察的学校
  schools: School[];
  focusMapTrigger: number; // 递增触发地图聚焦到学校中心
  /** 聚焦到指定校区（center + 可选 boundary 用于 setFitView） */
  focusCampusTrigger: number;
  focusCampusPayload: FocusCampusPayload | null;
  /** 临时高亮子 POI（用于「在地图中查看」） */
  highlightSubPOI: HighlightSubPOI | null;

  /** 当前选中的父 POI（打开抽屉时） */
  activePOI: POIWithStatus | null;
  /** 当前选中的子 POI */
  selectedSubPOI: POIWithStatus | null;
  /** 打开抽屉前的地图视图，用于关闭时恢复 */
  mapViewHistory: MapViewState | null;
  /** 高亮的 POI ID（用于地图 Marker 视觉反馈） */
  highlightedPoiId: string | null;

  setActiveSchool: (school: School | null) => void;
  setInspectedSchool: (school: School | null) => void;
  setSchools: (schools: School[]) => void;
  triggerFocusMap: () => void;
  /** 聚焦到指定校区，并清除 POI 选中状态 */
  triggerFocusToCampus: (payload: FocusCampusPayload) => void;
  setHighlightSubPOI: (poi: HighlightSubPOI | null) => void;

  /** 选中父 POI，并保存当前地图视图 */
  selectParentPOI: (poi: POIWithStatus | null, currentView: MapViewState | null) => void;
  /** 选中子 POI */
  selectSubPOI: (poi: POIWithStatus | null) => void;
  /** 清除选中状态，返回 mapViewHistory 供恢复地图（mapViewHistory 保留供 map 读取后恢复） */
  clearSelection: () => MapViewState | null;
  /** 恢复完成后清除 mapViewHistory，由 map 调用 */
  clearMapViewHistory: () => void;
  setHighlightPoi: (id: string | null) => void;
}

/**
 * 学校状态管理 Store
 * 用于管理当前选中的学校和学校列表
 */
export const useSchoolStore = create<SchoolState>((set, get) => ({
  activeSchool: null,
  inspectedSchool: null,
  schools: [],
  focusMapTrigger: 0,
  focusCampusTrigger: 0,
  focusCampusPayload: null,
  highlightSubPOI: null,
  activePOI: null,
  selectedSubPOI: null,
  mapViewHistory: null,
  highlightedPoiId: null,

  setActiveSchool: (school) => {
    set({ activeSchool: school });
  },

  setInspectedSchool: (school) => {
    set({ inspectedSchool: school });
  },

  setSchools: (schools) => {
    set({ schools });
  },

  triggerFocusMap: () => {
    set((state) => ({ focusMapTrigger: state.focusMapTrigger + 1 }));
  },

  triggerFocusToCampus: (payload) => {
    set((state) => ({
      focusCampusTrigger: state.focusCampusTrigger + 1,
      focusCampusPayload: payload,
      activePOI: null,
      selectedSubPOI: null,
    }));
  },

  setHighlightSubPOI: (poi) => {
    set({ highlightSubPOI: poi });
  },

  selectParentPOI: (poi, currentView) => {
    set({
      activePOI: poi,
      mapViewHistory: currentView,
      selectedSubPOI: null,
    });
  },

  selectSubPOI: (poi) => {
    set({ selectedSubPOI: poi });
  },

  clearSelection: () => {
    const { mapViewHistory } = get();
    set({
      activePOI: null,
      selectedSubPOI: null,
      // 保留 mapViewHistory 供 map 读取后恢复，map 调用 clearMapViewHistory 清除
    });
    return mapViewHistory;
  },

  clearMapViewHistory: () => {
    set({ mapViewHistory: null });
  },

  setHighlightPoi: (id) => {
    set({ highlightedPoiId: id });
  },
}));

