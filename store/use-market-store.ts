import { create } from "zustand";

export interface MarketFilters {
  typeId?: string;
  categoryId?: string;
  search?: string;
}

interface MarketState {
  isOpen: boolean;
  selectedItemId: string | null;
  selectedItemPoiId: string | null;
  selectedItemTitle: string | null;
  focusMode: boolean;
  filters: MarketFilters;
  refreshTrigger: number;
  openMarket: () => void;
  closeMarket: () => void;
  selectItem: (id: string | null, poiId?: string | null, title?: string | null) => void;
  setFocusMode: (mode: boolean) => void;
  setFilters: (filters: Partial<MarketFilters>) => void;
  triggerRefresh: () => void;
}

/**
 * 生存集市状态管理 Store
 * 用于 Map-Centric 布局：控制集市 Overlay Drawer 的开关、选中商品、筛选条件
 */
export const useMarketStore = create<MarketState>((set, get) => ({
  isOpen: false,
  selectedItemId: null,
  selectedItemPoiId: null,
  selectedItemTitle: null,
  focusMode: false,
  filters: {},
  refreshTrigger: 0,

  openMarket: () => {
    set({ isOpen: true });
  },

  closeMarket: () => {
    set({ isOpen: false, selectedItemId: null, selectedItemPoiId: null, selectedItemTitle: null, focusMode: false });
  },

  selectItem: (id, poiId, title) => {
    set({
      selectedItemId: id,
      selectedItemPoiId: poiId ?? null,
      selectedItemTitle: title ?? null,
    });
  },

  setFocusMode: (mode) => {
    if (mode) {
      set({ focusMode: true, isOpen: false });
    } else {
      set({ focusMode: false, isOpen: !!get().selectedItemId });
    }
  },

  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  triggerRefresh: () => {
    set((state) => ({ refreshTrigger: state.refreshTrigger + 1 }));
  },
}));
