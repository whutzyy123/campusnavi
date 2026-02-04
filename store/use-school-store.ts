import { create } from "zustand";

export interface School {
  id: string;
  name: string;
  schoolCode: string;
  boundary: any; // GeoJSON Polygon
  centerLat: number;
  centerLng: number;
}

interface SchoolState {
  activeSchool: School | null;
  inspectedSchool: School | null; // 超级管理员临时视察的学校
  schools: School[];
  setActiveSchool: (school: School | null) => void;
  setInspectedSchool: (school: School | null) => void;
  setSchools: (schools: School[]) => void;
  detectSchool: (lat: number, lng: number) => Promise<School | null>;
}

/**
 * 学校状态管理 Store
 * 用于管理当前选中的学校和学校列表
 */
export const useSchoolStore = create<SchoolState>((set, get) => ({
  activeSchool: null,
  inspectedSchool: null,
  schools: [],

  setActiveSchool: (school) => {
    set({ activeSchool: school });
  },

  setInspectedSchool: (school) => {
    set({ inspectedSchool: school });
  },

  setSchools: (schools) => {
    set({ schools });
  },

  /**
   * 根据经纬度检测用户所属学校（已废弃：不再用于自动切换学校，仅保留兼容性）
   */
  detectSchool: async (lat: number, lng: number) => {
    try {
      const response = await fetch(`/api/schools/detect?lat=${lat}&lng=${lng}`);
      const data = await response.json();

      if (data.success && data.school) {
        const school = data.school;
        set({ activeSchool: school });
        return school;
      }

      return null;
    } catch (error) {
      console.error("检测学校失败:", error);
      return null;
    }
  },
}));

