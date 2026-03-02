"use client";

import { useEffect, useRef } from "react";
import { useMarketStore } from "@/store/use-market-store";
import { useSchoolStore } from "@/store/use-school-store";
import { getPOIDetail } from "@/lib/poi-actions";
import type { POIWithStatus } from "@/lib/poi-utils";

/**
 * 集市 Focus Mode 地图联动
 * 当 focusMode 变为 true 且 selectedItemPoiId 存在时：
 * - Root POI：直接 setHighlightPoi，poi-map 执行 panTo + 脉动
 * - Sub-POI：始终使用 setHighlightSubPOI 渲染独立临时标记（避免父级展开的竞态）
 * 若 POI 不在 pois 中，则通过 getPOIDetail 拉取
 */
export function useMarketMapLinkage(pois: POIWithStatus[] = []) {
  const focusMode = useMarketStore((s) => s.focusMode);
  const selectedItemPoiId = useMarketStore((s) => s.selectedItemPoiId);
  const setHighlightPoi = useSchoolStore((s) => s.setHighlightPoi);
  const setHighlightSubPOI = useSchoolStore((s) => s.setHighlightSubPOI);
  const poisRef = useRef(pois);
  poisRef.current = pois;

  useEffect(() => {
    // THE LOCK: 地图仅在 focusMode 为 true 时响应，点击列表项（仅设置 selectedItemPoiId）不移动地图
    if (!focusMode || !selectedItemPoiId) return;

    const run = async () => {
      let poi = poisRef.current.find((p) => p.id === selectedItemPoiId);

      // 本地未找到时，通过 Server Action 拉取
      if (!poi) {
        const result = await getPOIDetail(selectedItemPoiId);
        if (!result.success || !result.data?.poi) return;
        const p = result.data.poi;
        poi = {
          id: p.id,
          schoolId: p.schoolId,
          parentId: p.parentId,
          name: p.name,
          category: p.category as POIWithStatus["category"],
          lat: p.lat,
          lng: p.lng,
          isOfficial: p.isOfficial,
          description: p.description ?? undefined,
          imageUrl: p.imageUrl ?? undefined,
          reportCount: p.reportCount,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }

      const isSubPOI = !!poi.parentId;

      if (isSubPOI) {
        // Sub-POI：始终使用临时标记，直接渲染，无竞态
        setHighlightSubPOI({ lat: poi.lat, lng: poi.lng, name: poi.name });
      } else {
        // Root POI：直接高亮
        setHighlightPoi(selectedItemPoiId);
      }
    };

    run();
  }, [focusMode, selectedItemPoiId, setHighlightPoi, setHighlightSubPOI]);
}
