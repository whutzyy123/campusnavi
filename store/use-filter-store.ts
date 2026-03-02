import { create } from "zustand";

interface FilterState {
  /** 当前选中的分类 ID 列表（选中的分类在地图上可见） */
  selectedCategoryIds: string[];
  /** 切换分类选中状态：若已选中则移除，未选中则添加 */
  toggleCategory: (id: string) => void;
  /** 设置全部分类为选中（初始化时调用，传入当前学校所有可用分类 ID） */
  setAllCategories: (ids: string[]) => void;
  /** 清空筛选状态（切换学校时调用，避免跨校 ID 冲突） */
  resetFilters: () => void;
}

/**
 * 地图 POI 分类筛选状态
 * 用于管理底图 POI 分类的显隐（勾选/取消勾选）
 */
export const useFilterStore = create<FilterState>((set) => ({
  selectedCategoryIds: [],

  toggleCategory: (id) => {
    set((state) => {
      const exists = state.selectedCategoryIds.includes(id);
      if (exists) {
        return {
          selectedCategoryIds: state.selectedCategoryIds.filter((cid) => cid !== id),
        };
      }
      return {
        selectedCategoryIds: [...state.selectedCategoryIds, id],
      };
    });
  },

  setAllCategories: (ids) => {
    set({ selectedCategoryIds: ids });
  },

  resetFilters: () => {
    set({ selectedCategoryIds: [] });
  },
}));
