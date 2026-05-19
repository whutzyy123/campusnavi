/**
 * POI 地图 Marker HTML 模板生成函数
 */

import { getStatusBadgeHtml } from "@/lib/geo/poi-map-helpers";

/**
 * 生成用户位置标记 HTML（蓝色脉动圆点）
 */
export function getPulseMarkerContent(): string {
  return `
    <div style="
      position: relative;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <!-- 外层脉动圆环 -->
      <div style="
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: #1890ff;
        opacity: 0.3;
        animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      "></div>
      <!-- 中层脉动圆环 -->
      <div style="
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #1890ff;
        opacity: 0.5;
        animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        animation-delay: 0.5s;
      "></div>
      <!-- 核心圆点 -->
      <div style="
        position: relative;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #1890ff;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(24, 144, 255, 0.5);
        z-index: 10;
      "></div>
      <style>
        @keyframes pulse-ring {
          0% {
            transform: scale(0.8);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.1;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      </style>
    </div>
  `;
}

/**
 * 生成 POI 标记 HTML
 * @param statusBadgeHtml 状态徽章 HTML（来自 getStatusBadgeHtml）
 * @param isHighlighted 是否高亮（脉动效果）
 * @param isSelected 是否选中
 */
export function getPOIMarkerContent(
  statusBadgeHtml: string,
  isHighlighted: boolean,
  isSelected: boolean
): string {
  const highlightPulseHtml = isHighlighted
    ? '<div class="poi-highlight-pulse" style="position:absolute;left:2px;top:2px;width:20px;height:20px;background:var(--primary-theme-pulse);border-radius:50%;animation:poi-marker-pulse 1.5s infinite;pointer-events:none;z-index:10;"></div>'
    : "";
  const selectedClass = isSelected ? " selected" : "";

  return `
    <div class="poi-marker-wrapper" style="position:relative;width:24px;height:24px;overflow:visible;">
      <div class="flat-marker${selectedClass}">
        <div class="marker-halo"></div>
        <div class="marker-inner"></div>
      </div>
      ${statusBadgeHtml}
      ${highlightPulseHtml}
    </div>
    <style>
      [data-zoom-level="high"] .poi-marker-wrapper { transform: scale(1); opacity: 1; pointer-events: auto; }
      [data-zoom-level="low"] .poi-marker-wrapper { opacity: 0; pointer-events: none; transform: scale(0.6); }
      .poi-marker-wrapper .poi-status-badge { position: absolute; top: -6px; right: -6px; font-size: 12px; line-height: 1; z-index: 2; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }
      .poi-status-crowded { animation: poi-badge-pulse 1.5s ease-in-out infinite; }
      @keyframes poi-badge-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.9; } }
      @keyframes poi-marker-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
    </style>
  `;
}

/**
 * 生成高亮标记 HTML（用于 highlightSubPOI）
 */
export function getHighlightMarkerContent(): string {
  return `
    <div style="position:relative;width:24px;height:24px;overflow:visible;">
      <div class="sub-poi-pulse" style="position:absolute;left:2px;top:2px;width:20px;height:20px;background:var(--primary-theme-pulse);border-radius:50%;animation:poi-marker-pulse 1.5s infinite;pointer-events:none;z-index:10;"></div>
      <div style="position:absolute;left:6px;top:6px;width:12px;height:12px;background:#FF4500;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(255,69,0,0.6);z-index:11;"></div>
    </div>
    <style>
      @keyframes poi-marker-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
    </style>
  `;
}

/**
 * 生成起点/终点标记 HTML
 * @param type "start" | "end"
 */
export function getStartEndMarkerContent(type: "start" | "end"): string {
  const bgColor = type === "start" ? "#22c55e" : "#ef4444";
  return `<div style="width:24px;height:24px;border-radius:50%;background:${bgColor};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`;
}

/**
 * 生成选点预览标记 HTML
 * @param type "start" | "end"
 */
export function getPickMarkerContent(type: "start" | "end"): string {
  const bgColor = type === "start" ? "#22c55e" : "#ef4444";
  return `<div style="width:24px;height:24px;border-radius:50%;background:${bgColor};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`;
}

/**
 * 构建 POI 标记完整内容（含状态徽章）
 * @param poiId POI ID
 * @param poiStatusMap 状态映射
 * @param highlightedPoiId 高亮 POI ID
 * @param activePOIId 活动父 POI ID
 * @param selectedSubPOIId 选中的子 POI ID
 */
export function buildPOIMarkerContent(
  poiId: string,
  poiStatusMap: Record<string, string>,
  highlightedPoiId: string | null,
  activePOIId: string | null,
  selectedSubPOIId: string | null
): string {
  const liveStatusType = poiStatusMap[poiId];
  const statusBadgeHtml = liveStatusType ? getStatusBadgeHtml(liveStatusType) : "";
  const isHighlighted = highlightedPoiId === poiId;
  const isSelected = activePOIId === poiId || selectedSubPOIId === poiId;
  return getPOIMarkerContent(statusBadgeHtml, isHighlighted, isSelected);
}
