/**
 * 高德地图 React Hook
 * 用于在组件中安全地加载和使用高德地图 SDK
 */

import { useEffect, useState } from "react";
import { loadAMap, isAMapLoaded, getAMapInstance } from "@/lib/geo/amap-loader";

export function useAMap() {
  const [amap, setAmap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    loadAMap()
      .then(() => {
        if (mounted && isAMapLoaded()) {
          setAmap(getAMapInstance());
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("高德地图加载失败"));
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { amap, loading, error };
}

