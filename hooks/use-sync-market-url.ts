"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMarketStore } from "@/store/use-market-store";

/**
 * 同步 URL Search Params 与集市 Store
 * - URL → Store: ?market=true 或 ?marketItemId=xxx 时打开集市并选中商品
 * - Store → URL: 用户关闭抽屉时移除 market / marketItemId 参数（避免历史栈堆积）
 *
 * 必须在首页（/）使用，且调用组件需包裹在 Suspense 内（useSearchParams 要求）
 */
export function useSyncMarketUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, openMarket, selectItem, selectedItemId } = useMarketStore();

  // URL → Store: 挂载或 params 变化时同步
  useEffect(() => {
    const market = searchParams.get("market");
    const marketItemId = searchParams.get("marketItemId");

    if (market === "true" || marketItemId) {
      openMarket();
      selectItem(marketItemId || null);
    }
  }, [searchParams, openMarket, selectItem]);

  // Store → URL: 选中商品时更新 marketItemId（深链接分享）
  useEffect(() => {
    if (pathname !== "/" || !selectedItemId) return;
    const current = searchParams.get("marketItemId");
    if (current === selectedItemId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("market", "true");
    params.set("marketItemId", selectedItemId);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [pathname, selectedItemId, searchParams, router]);

  // Store → URL: 用户关闭抽屉时移除 params（仅首页）
  useEffect(() => {
    if (!isOpen && pathname === "/") {
      const market = searchParams.get("market");
      const marketItemId = searchParams.get("marketItemId");
      if (market === "true" || marketItemId) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("market");
        params.delete("marketItemId");
        const next = params.toString() ? `/?${params.toString()}` : "/";
        router.replace(next);
      }
    }
  }, [isOpen, pathname, searchParams, router]);

  // Store → URL: 关闭 Modal（selectItem(null)）时移除 marketItemId
  useEffect(() => {
    if (pathname !== "/" || selectedItemId !== null) return;
    const marketItemId = searchParams.get("marketItemId");
    if (!marketItemId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("marketItemId");
    const next = params.toString() ? `/?${params.toString()}` : "/";
    router.replace(next, { scroll: false });
  }, [pathname, selectedItemId, searchParams, router]);
}
