"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, History, User, Pencil, CheckCircle, RotateCcw, Shield, Info, FileDown, Loader2 } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { getAdminItemAuditTrail, generateMarketAuditReport, type AdminItemAuditTrailResult } from "@/lib/market-actions";
import { cn, formatDateTime } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  INTENTION_CREATED: "提交了意向",
  INTENTION_WITHDRAWN: "撤回了意向",
  ITEM_LOCKED: "选定买家并锁定",
  ITEM_UNLOCKED: "取消锁定并重新上架",
  INTENTION_RESET_BY_UNLOCK: "系统自动重置了买家的意向",
  TRANSACTION_COMPLETED: "交易完成",
  BUYER_CONFIRMED: "买家确认交易完成",
  SELLER_CONFIRMED: "卖家确认交易完成",
  ITEM_EDITED: "修改了物品信息",
  ADMIN_HIDDEN: "下架了此商品",
  ADMIN_RELISTED: "重新上架",
  ITEM_DELETED: "删除商品",
};

/** 动作类型对应的图标 */
const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ITEM_EDITED: Pencil,
  BUYER_CONFIRMED: CheckCircle,
  SELLER_CONFIRMED: CheckCircle,
  ITEM_UNLOCKED: RotateCcw,
  INTENTION_RESET_BY_UNLOCK: Info,
};

/** 动作类型对应的颜色变体 */
type ActionVariant = "success" | "danger" | "warning" | "info" | "default";

const ACTION_VARIANTS: Record<string, ActionVariant> = {
  INTENTION_CREATED: "info",
  INTENTION_WITHDRAWN: "warning",
  ITEM_LOCKED: "info",
  ITEM_UNLOCKED: "info",
  INTENTION_RESET_BY_UNLOCK: "default",
  TRANSACTION_COMPLETED: "success",
  BUYER_CONFIRMED: "success",
  SELLER_CONFIRMED: "success",
  ITEM_EDITED: "warning",
  ADMIN_HIDDEN: "danger",
  ADMIN_RELISTED: "success",
  ITEM_DELETED: "danger",
};

const VARIANT_STYLES: Record<ActionVariant, string> = {
  success: "bg-green-100 text-green-800 border-green-200",
  danger: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
  default: "bg-gray-100 text-gray-800 border-gray-200",
};

/** 是否为管理员角色（2: 校管, 3: 工作人员, 4: 超管） */
function isAdminRole(role?: number): boolean {
  return role === 2 || role === 3 || role === 4;
}

function formatIdentity(user: { nickname: string | null; email: string | null }): string {
  const { nickname, email } = user;
  if (nickname && email) return `${nickname} (${email})`;
  if (nickname) return nickname;
  if (email) return email;
  return "未知用户";
}

function getLockedForText(details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { selectedBuyerId?: string; buyerEmail?: string | null };
    if (parsed.buyerEmail) {
      return `（买家: ${parsed.buyerEmail}）`;
    }
    if (parsed.selectedBuyerId) {
      return `（买家 ID: ${parsed.selectedBuyerId.slice(0, 8)}…）`;
    }
  } catch {
    return details ? `（${details}）` : null;
  }
  return null;
}

function getDetailsSuffix(action: string, details: string | null): string | null {
  if (!details) return null;
  if (action === "ITEM_LOCKED") return getLockedForText(details);
  if (action === "INTENTION_RESET_BY_UNLOCK") return getLockedForText(details);
  if (action === "ITEM_EDITED") return `（${details}）`;
  if (action === "ITEM_DELETED" && details === "管理员彻底删除") return `（${details}）`;
  return null;
}

interface MarketAuditDrawerProps {
  itemId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex-shrink-0 w-36 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="flex-1 flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketAuditDrawer({ itemId, isOpen, onClose }: MarketAuditDrawerProps) {
  const [data, setData] = useState<AdminItemAuditTrailResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const fetchTrail = useCallback(async () => {
    if (!itemId) return;
    setIsLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await getAdminItemAuditTrail(itemId);
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error ?? "获取审计轨迹失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取审计轨迹失败");
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (isOpen && itemId) {
      fetchTrail();
    }
  }, [isOpen, itemId, fetchTrail]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleEscape]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleAnimationComplete = useCallback(() => {
    if (isClosing) {
      onClose();
      setIsClosing(false);
    }
  }, [isClosing, onClose]);

  const handleExportReport = useCallback(async () => {
    if (!itemId || !data) return;
    setIsExporting(true);
    try {
      const result = await generateMarketAuditReport(itemId);
      if (result.success && result.data) {
        const blob = new Blob([result.data], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `market-audit-${itemId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("报告已开始下载");
      } else {
        toast.error(result.error ?? "导出失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setIsExporting(false);
    }
  }, [itemId, data]);

  if (!isOpen && !isClosing) return null;

  const content = (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isClosing ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/50"
          onClick={handleClose}
          role="presentation"
        />
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: isClosing ? "100%" : 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onAnimationComplete={handleAnimationComplete}
          className="fixed right-0 top-0 bottom-0 z-[210] w-full max-w-md flex flex-col bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-drawer-title"
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2 min-w-0">
              <History className="h-5 w-5 shrink-0 text-[#FF4500]" />
              <h2 id="audit-drawer-title" className="text-lg font-semibold text-gray-900 truncate">
                交互日志
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportReport}
                disabled={!data || isExporting}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="导出报告"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                导出报告
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content - scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 py-4">
            {isLoading ? (
              <TimelineSkeleton />
            ) : error ? (
              <div className="py-8 text-center text-red-600">{error}</div>
            ) : data ? (
              <>
                {/* Item summary */}
                <div className="mb-6 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{data.item.title}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>状态: {data.item.status}</span>
                    {data.item.category && (
                      <span>· 分类: {data.item.category.name}</span>
                    )}
                    <span>· 卖家: {formatIdentity(data.item.seller)}</span>
                  </div>
                </div>

                {/* Timeline */}
                <div className="relative">
                  <div className="absolute left-[11rem] top-6 bottom-6 w-0.5 bg-gray-200" />
                  <div className="space-y-6">
                    {data.history.map((entry, idx) => {
                      const variant = ACTION_VARIANTS[entry.action] ?? "default";
                      const suffix = getDetailsSuffix(entry.action, entry.details);
                      const label = ACTION_LABELS[entry.action] ?? entry.action;
                      const ActionIcon = ACTION_ICONS[entry.action];
                      const showAdminBadge = isAdminRole(entry.user.role);
                      return (
                        <div key={idx} className="flex gap-4 relative">
                          <div className="flex-shrink-0 w-36 text-xs text-gray-500 font-mono pt-0.5">
                            {formatDateTime(entry.timestamp)}
                          </div>
                          <div className="flex-1 flex gap-3 min-w-0">
                            <div className="flex-shrink-0 relative z-10">
                              {entry.user.avatar ? (
                                <Image
                                  src={entry.user.avatar}
                                  alt=""
                                  width={40}
                                  height={40}
                                  className="rounded-full object-cover border-2 border-white shadow-sm"
                                  unoptimized={entry.user.avatar.startsWith("blob:")}
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                  <User className="h-5 w-5 text-gray-500" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 font-medium truncate flex items-center gap-1.5">
                                {formatIdentity(entry.user)}
                                {showAdminBadge && (
                                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 border border-violet-200">
                                    <Shield className="h-2.5 w-2.5" />
                                    管理员
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-gray-700 mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border",
                                    VARIANT_STYLES[variant]
                                  )}
                                >
                                  {ActionIcon && <ActionIcon className="h-3.5 w-3.5 shrink-0" />}
                                  {label}
                                </span>
                                {suffix && (
                                  <span className="text-gray-500 text-xs">{suffix}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {data.history.length === 0 && (
                  <div className="py-8 text-center text-gray-500 text-sm">暂无交互记录</div>
                )}
              </>
            ) : null}
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
