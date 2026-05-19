/**
 * App UI 壳层 z-index（fixed / portal）。
 * 勿与 AMap Marker / Polygon 的 zIndex 混用 — 见 lib/poi-map/z-index.ts。
 */

export const Z_INDEX = {
  navbar: 40,
  sidebarBackdrop: 44,
  sidebar: 45,
  dropdown: 50,
  tabBar: 55,
  mapControl: 60,
  mapBanner: 70,
  drawerOverlay: 100,
  drawerContent: 110,
  modalOverlay: 100,
  modalContent: 110,
  popover: 120,
  toast: 130,
  mapModalOverlay: 200,
  mapModalContent: 210,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX;

/** layer → Tailwind class（z-{token}） */
const Z_CLASS_MAP: Record<ZIndexLayer, string> = {
  navbar: "z-navbar",
  sidebarBackdrop: "z-sidebar-backdrop",
  sidebar: "z-sidebar",
  dropdown: "z-dropdown",
  tabBar: "z-tab-bar",
  mapControl: "z-map-control",
  mapBanner: "z-map-banner",
  drawerOverlay: "z-drawer-overlay",
  drawerContent: "z-drawer-content",
  modalOverlay: "z-modal-overlay",
  modalContent: "z-modal-content",
  popover: "z-popover",
  toast: "z-toast",
  mapModalOverlay: "z-map-modal-overlay",
  mapModalContent: "z-map-modal-content",
};

export function zClass(layer: ZIndexLayer): string {
  return Z_CLASS_MAP[layer];
}
