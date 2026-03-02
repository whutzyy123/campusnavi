"use client";

import { useState, useEffect } from "react";

/**
 * 媒体查询 Hook，用于响应式布局（如 Desktop vs Mobile）
 * 服务端与首次客户端渲染返回一致默认值，避免 hydration mismatch
 *
 * @param query 媒体查询字符串，如 "(min-width: 768px)"
 * @returns 是否匹配（服务端默认 false，客户端 mount 后更新）
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
