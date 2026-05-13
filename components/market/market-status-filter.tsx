"use client";

import React from "react";
import { Package, Heart } from "lucide-react";
import type { MarketRole, MarketStatusFilter } from "./market-transaction-types";
import type { MarketTransactionItem } from "./market-transaction-types";
import type { MarketSubTab } from "./market-transaction-types";

export interface MarketStatusFilterProps {
  role: MarketRole;
  statusFilter: MarketStatusFilter;
  /** Dashboard 层计算好的卖家状态数量 */
  statusCounts: {
    all: number;
    ongoing: number;
    ended: number;
  };
  /** Dashboard 层计算好的买家状态数量 */
  buyerStatusCounts: {
    all: number;
    ongoing: number;
    ended: number;
  };
  sellingCount: number;
  buyingCount: number;
  isSmallScreen: boolean;
  onRoleChange: (r: MarketRole) => void;
  onStatusChange: (s: MarketStatusFilter) => void;
}

export function MarketStatusFilter({
  role,
  statusFilter,
  statusCounts,
  buyerStatusCounts,
  sellingCount,
  buyingCount,
  isSmallScreen,
  onRoleChange,
  onStatusChange,
}: MarketStatusFilterProps) {
  const SELLING_TABS = [
    { id: "all" as MarketStatusFilter, label: "全部" },
    { id: "ongoing" as MarketStatusFilter, label: "进行中" },
    { id: "ended" as MarketStatusFilter, label: "已结束" },
  ];
  const BUYING_TABS = [
    { id: "all" as MarketStatusFilter, label: "全部" },
    { id: "ongoing" as MarketStatusFilter, label: "进行中" },
    { id: "ended" as MarketStatusFilter, label: "已结束" },
  ];

  const currentTabs = role === "seller" ? SELLING_TABS : BUYING_TABS;
  const currentCounts =
    role === "seller"
      ? { all: sellingCount, ongoing: statusCounts.ongoing, ended: statusCounts.ended }
      : { all: buyingCount, ongoing: buyerStatusCounts.ongoing, ended: buyerStatusCounts.ended };

  return (
    <div>
      {/* 角色切换：卖家 / 买家 */}
      <div
        className={`flex rounded-xl bg-[#EDEFF1] p-1 ${
          isSmallScreen ? "py-1" : "p-1"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            onRoleChange("seller");
            onStatusChange("all");
          }}
          className={`flex-1 rounded-lg text-sm font-medium transition-colors ${
            isSmallScreen ? "px-3 py-2" : "px-4 py-2.5"
          } ${
            role === "seller"
              ? "bg-white text-[#1A1A1B] shadow-sm"
              : "text-[#7C7C7C] hover:text-[#1A1A1B]"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5 md:gap-2">
            <Package className="h-3.5 w-3.5 md:h-4 md:w-4" />
            {isSmallScreen ? "卖家" : "我是卖家"}
            <span className="rounded-full bg-[#EDEFF1] px-1.5 py-0.5 text-xs md:px-2">
              {sellingCount}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            onRoleChange("buyer");
            onStatusChange("all");
          }}
          className={`flex-1 rounded-lg text-sm font-medium transition-colors ${
            isSmallScreen ? "px-3 py-2" : "px-4 py-2.5"
          } ${
            role === "buyer"
              ? "bg-white text-[#1A1A1B] shadow-sm"
              : "text-[#7C7C7C] hover:text-[#1A1A1B]"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5 md:gap-2">
            <Heart className="h-3.5 w-3.5 md:h-4 md:w-4" />
            {isSmallScreen ? "买家" : "我是买家"}
            <span className="rounded-full bg-[#EDEFF1] px-1.5 py-0.5 text-xs md:px-2">
              {buyingCount}
            </span>
          </span>
        </button>
      </div>

      {/* 状态筛选：全部 / 进行中 / 已结束 */}
      <div className="mt-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2 min-w-max md:min-w-0 md:flex-wrap">
          {currentTabs.map(({ id, label }) => {
            const count = currentCounts[id];
            const isActive = statusFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onStatusChange(id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#FF4500] text-white"
                    : "bg-[#EDEFF1] text-[#1A1A1B] hover:bg-[#E4E6E8]"
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
