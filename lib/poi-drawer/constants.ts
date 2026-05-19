/**
 * POI Drawer 常量配置
 */

/** 实时状态徽章展示配置（含 emoji 用于去重展示） */
export const LIVE_STATUS_BADGE_CONFIG: Record<string, { label: string; emoji: string; className: string }> = {
  EMPTY: { label: "空闲畅通", emoji: "🟢", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  BUSY: { label: "略显拥挤", emoji: "🟡", className: "border-amber-200 bg-amber-50 text-amber-800" },
  CROWDED: { label: "爆满排队", emoji: "🔴", className: "border-red-200 bg-red-50 text-red-800" },
  CONSTRUCTION: { label: "施工绕行", emoji: "🚧", className: "border-orange-200 bg-orange-50 text-orange-800" },
  CLOSED: { label: "暂停营业/关闭", emoji: "🔒", className: "border-slate-200 bg-slate-100 text-slate-700" },
};

/** Ephemeral 上报按钮配置：Group 1 人流，Group 2 事件 */
export const LIVE_STATUS_BUTTONS = {
  traffic: [
    { id: "EMPTY", label: "空闲畅通", emoji: "🟢", className: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
    { id: "BUSY", label: "略显拥挤", emoji: "🟡", className: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" },
    { id: "CROWDED", label: "爆满排队", emoji: "🔴", className: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" },
  ],
  events: [
    { id: "CONSTRUCTION", label: "施工绕行", emoji: "🚧", className: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100" },
    { id: "CLOSED", label: "暂停营业/关闭", emoji: "🔒", className: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200" },
  ],
} as const;

/** 上报冷却时间（毫秒） */
export const REPORT_COOLDOWN_MS = 60 * 1000; // 60 秒

/** 乐观更新 ID 前缀 */
export const OPTIMISTIC_ID_PREFIX = "optimistic-";
