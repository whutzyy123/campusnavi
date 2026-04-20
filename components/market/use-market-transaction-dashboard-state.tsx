"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getMyMarketItems } from "@/lib/market-actions";
import type { MarketRole, MarketStatusFilter, MarketTransactionItem } from "./market-transaction-types";

/**
 * 中控台「我的交易」列表：角色 Tab、状态筛选、列表拉取与本地更新入口。
 */
export function useMarketTransactionDashboardState(
  currentUserId: string | undefined,
  initialView?: "buying" | "selling" | null
) {
  const [marketSellingAll, setMarketSellingAll] = useState<MarketTransactionItem[]>([]);
  const [marketBuyingAll, setMarketBuyingAll] = useState<MarketTransactionItem[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketRole, setMarketRole] = useState<MarketRole>(initialView === "buying" ? "buyer" : "seller");
  const [marketStatusFilter, setMarketStatusFilter] = useState<MarketStatusFilter>("all");

  const refreshMarketItems = useCallback(async () => {
    if (!currentUserId) return;
    setMarketLoading(true);
    try {
      const result = await getMyMarketItems();
      if (result.success && result.data) {
        const d = result.data;
        const normalize = (items: typeof d.selling): MarketTransactionItem[] =>
          (items ?? []).map((x) => ({
            ...x,
            buyerId: x.buyerId ?? null,
            buyer: x.buyer ?? undefined,
            seller: x.seller ?? undefined,
          }));
        setMarketSellingAll(normalize(d.selling));
        setMarketBuyingAll(normalize(d.buying));
      } else {
        toast.error(result.error || "获取集市交易失败");
      }
    } catch (e) {
      console.error("获取集市交易失败:", e);
      toast.error("获取失败，请重试");
    } finally {
      setMarketLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    refreshMarketItems();
  }, [currentUserId, refreshMarketItems]);

  return {
    marketSellingAll,
    setMarketSellingAll,
    marketBuyingAll,
    setMarketBuyingAll,
    marketLoading,
    marketRole,
    setMarketRole,
    marketStatusFilter,
    setMarketStatusFilter,
    refreshMarketItems,
  };
}
