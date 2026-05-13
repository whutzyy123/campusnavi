"use client";

import React from "react";
import Image from "next/image";
import {
  MapPin,
  ExternalLink,
  Loader2,
  ShoppingBag,
  LockKeyhole,
  RotateCcw,
  CheckCircle,
  Pencil,
  Heart,
  Trash2,
  Eye,
  Phone,
  ThumbsUp,
  ThumbsDown,
  Clock,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/core/utils";
import type {
  MarketSubTab,
  MarketTransactionItem,
} from "./market-transaction-types";

export interface MarketTransactionCardProps {
  item: MarketTransactionItem;
  role: "seller" | "buyer";
  subTab: MarketSubTab;
  currentUserId: string;
  onUnlock?: (id: string) => void;
  onConfirm: (id: string) => void;
  onRate?: (itemId: string, isPositive: boolean) => void;
  onViewDetails: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onWithdrawIntention?: (id: string) => void;
  onReAddIntention?: (id: string) => void;
  actionId: string | null;
  ratingId: string | null;
  formatTime: (s: string) => string;
  isHighlighted?: boolean;
}

export function MarketTransactionCard({
  item,
  role,
  subTab,
  currentUserId,
  onUnlock,
  onConfirm,
  onRate,
  onViewDetails,
  onEdit,
  onDelete,
  onWithdrawIntention,
  onReAddIntention,
  actionId,
  ratingId,
  formatTime,
  isHighlighted,
}: MarketTransactionCardProps) {
  const isLocked = item.status === "LOCKED";
  const isCompleted = item.status === "COMPLETED";
  const isActive = item.status === "ACTIVE";
  const isExpired = item.status === "EXPIRED";

  const isUnavailable =
    role === "buyer" &&
    ((isCompleted && item.selectedBuyerId !== currentUserId) ||
      isExpired ||
      item.status === "DELETED" ||
      item.status === "HIDDEN" ||
      (isLocked && item.selectedBuyerId !== currentUserId));

  const unavailableReason: "sold" | "expired" | "removed" | "locked" | null =
    role === "buyer"
      ? isLocked && item.selectedBuyerId !== currentUserId
        ? "locked"
        : isCompleted && item.selectedBuyerId !== currentUserId
          ? "sold"
          : isExpired
            ? "expired"
            : item.status === "DELETED" || item.status === "HIDDEN"
              ? "removed"
              : null
      : null;

  const isLockedForMe = role === "buyer" && isLocked && item.selectedBuyerId === currentUserId;

  const myConfirmed = role === "seller" ? item.sellerConfirmed : item.buyerConfirmed;
  const confirmStatusText = isLocked && !isCompleted
    ? myConfirmed
      ? "你已确认"
      : "等待对方确认"
    : null;

  const loading = actionId === item.id;

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const btnPrimary = `${btn} bg-[#FF4500] text-white transition-colors hover:opacity-90`;
  const btnSecondary = `${btn} border border-[#EDEFF1] bg-white text-[#1A1A1B] transition-colors hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]`;
  const btnDanger = `${btn} border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50`;

  const unavailableBadgeLabel =
    unavailableReason === "sold"
      ? "已售出"
      : unavailableReason === "expired"
        ? "已失效"
        : unavailableReason === "removed"
          ? "已下架"
          : unavailableReason === "locked"
            ? "已被他人锁定"
            : null;

  const statusBadge =
    item.status === "DELETED" || item.status === "HIDDEN"
      ? { label: "已下架", className: "bg-slate-100 text-slate-600" }
      : isCompleted
        ? { label: "已完成", className: "bg-green-100 text-green-800" }
        : isLocked
          ? { label: "交易中", className: "bg-amber-100 text-amber-800" }
          : isExpired
            ? { label: "已过期", className: "bg-gray-100 text-gray-600" }
            : { label: "在售", className: "bg-blue-100 text-blue-800" };

  return (
    <div
      className={`rounded-lg border p-4 transition-all duration-300 hover:border-[#FFE5DD] ${
        isHighlighted
          ? "border-[#FF4500] ring-2 ring-[#FF4500]/40 shadow-[0_0_0_3px_rgba(255,69,0,0.15)]"
          : "border-[#EDEFF1]"
      }`}
    >
      <div className="flex gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {item.images[0] ? (
            <Image
              src={item.images[0]}
              alt={item.title}
              fill
              className={`object-cover transition-all ${isUnavailable ? "grayscale opacity-50" : ""}`}
              sizes="80px"
              unoptimized={item.images[0].startsWith("blob:")}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center text-gray-400 transition-all ${isUnavailable ? "opacity-50" : ""}`}>
              <ShoppingBag className="h-8 w-8" />
            </div>
          )}
          {isUnavailable && (
            <>
              <div className="absolute inset-0 bg-slate-200/30" aria-hidden="true" />
              {unavailableBadgeLabel && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                    {unavailableBadgeLabel}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <div className={`min-w-0 flex-1 ${isUnavailable ? "opacity-70" : ""}`}>
          <h3 className="line-clamp-2 font-medium text-[#1A1A1B]">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#7C7C7C]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{item.poi?.name ?? "—"}</span>
            <span>·</span>
            <span>{item.transactionType?.name ?? "—"}</span>
            {item.transactionType?.code === "SALE" && item.price != null && (
              <>
                <span>·</span>
                <span className="font-medium text-[#FF4500]">¥{item.price}</span>
              </>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#7C7C7C]">{formatTime(item.createdAt)}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            {isCompleted && subTab === "acquired" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                <CheckCircle className="h-3.5 w-3.5" />
                交易已完成
              </span>
            )}
          </div>

          {isLockedForMe && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <LockKeyhole className="h-4 w-4 shrink-0" />
              交易锁定中 - 请联系卖家
            </div>
          )}

          {confirmStatusText && (
            <div className="mt-2 flex items-center gap-2">
              {myConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {confirmStatusText}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <Clock className="h-3.5 w-3.5" />
                  {confirmStatusText}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {subTab === "posted" && role === "seller" && (
              <>
                {isActive && (
                  <>
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(item.id)} disabled={loading} className={btnSecondary}>
                        <Pencil className="h-3.5 w-3.5" /> 编辑
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(item.id)} disabled={loading} className={btnDanger}>
                        <Trash2 className="h-3.5 w-3.5" /> 删除
                      </button>
                    )}
                    <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                      <Eye className="h-3.5 w-3.5" /> 查看意向
                    </button>
                  </>
                )}
                {isLocked && (
                  <>
                    {onUnlock && (
                      <button type="button" onClick={() => onUnlock(item.id)} disabled={loading} className={btnSecondary}>
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        重新上架
                      </button>
                    )}
                    {!myConfirmed && (
                      <button type="button" onClick={() => onConfirm(item.id)} disabled={loading} className={btnPrimary}>
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        确认交易完成
                      </button>
                    )}
                    <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                      <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                    </button>
                  </>
                )}
                {isCompleted && (
                  <>
                    {onRate && item.sellerRatingOfBuyer == null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">评价买家：</span>
                        <button
                          type="button"
                          onClick={() => onRate(item.id, true)}
                          disabled={ratingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          {ratingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                          好评
                        </button>
                        <button
                          type="button"
                          onClick={() => onRate(item.id, false)}
                          disabled={ratingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          差评
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                      <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                    </button>
                  </>
                )}
              </>
            )}
            {subTab === "interested" && role === "buyer" && isActive && (
              <>
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <Phone className="h-3.5 w-3.5" /> 联系卖家
                </button>
                {onWithdrawIntention && (
                  <button type="button" onClick={() => onWithdrawIntention(item.id)} disabled={loading} className={btnDanger}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    撤回意向
                  </button>
                )}
              </>
            )}
            {subTab === "locked" && role === "buyer" && isLocked && (
              <>
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <Phone className="h-3.5 w-3.5" /> 联系卖家
                </button>
                {!myConfirmed && (
                  <button type="button" onClick={() => onConfirm(item.id)} disabled={loading} className={btnPrimary}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    确认交易完成
                  </button>
                )}
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </button>
              </>
            )}
            {subTab === "acquired" && (
              <>
                {onRate && item.buyerRatingOfSeller == null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">评价卖家：</span>
                    <button
                      type="button"
                      onClick={() => onRate(item.id, true)}
                      disabled={ratingId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      {ratingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                      好评
                    </button>
                    <button
                      type="button"
                      onClick={() => onRate(item.id, false)}
                      disabled={ratingId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      差评
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </button>
              </>
            )}
            {subTab === "history" && (
              <>
                <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </button>
                {!isUnavailable && isActive && item.hasIntention !== false && (
                  <button type="button" onClick={() => onViewDetails(item.id)} className={btnSecondary}>
                    <Phone className="h-3.5 w-3.5" /> 联系卖家
                  </button>
                )}
                {!isUnavailable && isActive && item.hasIntention === false && onReAddIntention && (
                  <button
                    type="button"
                    onClick={() => onReAddIntention(item.id)}
                    disabled={loading}
                    className={btnPrimary}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Heart className="h-3.5 w-3.5" />}
                    重新添加意向
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
