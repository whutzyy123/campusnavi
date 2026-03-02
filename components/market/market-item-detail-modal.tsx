"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  X,
  Loader2,
  MapPin,
  Phone,
  Calendar,
  ShoppingBag,
  Pencil,
  Trash2,
  Eye,
  LockKeyhole,
  RotateCcw,
  CheckCircle,
  Send,
  User,
  Flame,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { getIntentions, type MarketIntentionWithUser, type UserReputation } from "@/lib/market-actions";

export interface MarketItemDetailData {
  id: string;
  poiId: string;
  title: string;
  description: string;
  contact: string | null;
  price: number | null;
  images: string[];
  status: string;
  /** @deprecated 使用 selectedBuyerId */
  buyerId?: string | null;
  selectedBuyerId?: string | null;
  buyerConfirmed?: boolean;
  sellerConfirmed?: boolean;
  lockedAt?: string | null;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
  transactionType: { id: number; name: string; code: string };
  user: { id: string; nickname: string | null };
  buyer?: { id: string; nickname: string | null } | null;
  selectedBuyer?: { id: string; nickname: string | null } | null;
  /** 当前用户是否已提交意向（用于展示卖家联系方式） */
  hasSubmittedIntention?: boolean;
  /** 表达意向的独立用户数（社交证明） */
  intentionsCount?: number;
  /** 卖家好评率 0-100 */
  sellerThumbsUpRate?: number;
  /** 买家好评率 0-100 */
  buyerThumbsUpRate?: number;
  /** 卖家声誉（好评率 + 评价数） */
  sellerReputation?: UserReputation;
  /** 买家对卖家的评价（true=好评，false=差评，null=未评价） */
  buyerRatingOfSeller?: boolean | null;
  /** 卖家对买家的评价 */
  sellerRatingOfBuyer?: boolean | null;
  masked?: boolean;
  message?: string;
  /** 是否被下架 */
  isHidden?: boolean;
}

interface MarketItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MarketItemDetailData | null;
  currentUser: { id: string } | null;
  /** market=集市页/抽屉, profile=中控台, map=地图覆盖（z-[210]，隐藏「在地图中查看」） */
  variant: "market" | "profile" | "map";
  /** Profile: lifecycle actions */
  onLock?: (id: string) => void;
  onUnlock?: (id: string) => void;
  /** 选定买家并锁定（卖家从意向列表中选择） */
  onSelectBuyerAndLock?: (itemId: string, buyerId: string) => Promise<{ success: boolean; error?: string }>;
  onConfirm?: (id: string) => void;
  onRate?: (itemId: string, isPositive: boolean) => void;
  onDelete?: (id: string) => void;
  actionId?: string | null;
  ratingId?: string | null;
  selectingBuyerId?: string | null;
  /** Market: browse actions - 提交意向（含联系方式） */
  onSubmitIntention?: (itemId: string, contactInfo: string | null) => Promise<{ success: boolean; error?: string }>;
  onReport?: () => void;
  onEdit?: () => void;
  /** 已提交意向后的回调（用于刷新 hasSubmittedIntention） */
  onIntentionSubmitted?: () => void;
  submittingIntentionId?: string | null;
  deletingItemId?: string | null;
  /** Both */
  onViewOnMap?: () => void;
  /** 查看用户资料（如点击卖家/意向用户头像） */
  onViewUserProfile?: (userId: string) => void;
}

export function MarketItemDetailModal({
  isOpen,
  onClose,
  item,
  currentUser,
  variant,
  onLock,
  onUnlock,
  onConfirm,
  onRate,
  onDelete,
  onSelectBuyerAndLock,
  actionId,
  ratingId,
  selectingBuyerId,
  onSubmitIntention,
  onReport,
  onEdit,
  onIntentionSubmitted,
  submittingIntentionId,
  deletingItemId,
  onViewOnMap,
  onViewUserProfile,
}: MarketItemDetailModalProps) {
  const [showIntentionForm, setShowIntentionForm] = useState(false);
  const [intentionContactInput, setIntentionContactInput] = useState("");
  const [localHasSubmittedIntention, setLocalHasSubmittedIntention] = useState(false);
  const [intentions, setIntentions] = useState<MarketIntentionWithUser[]>([]);
  const [intentionsLoading, setIntentionsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowIntentionForm(false);
      setIntentionContactInput("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (item && !item.hasSubmittedIntention) {
      setLocalHasSubmittedIntention(false);
    }
  }, [item]);

  useEffect(() => {
    if (!isOpen || !item) return;
    const isSellerCheck = currentUser?.id === item.user?.id;
    if (!isSellerCheck) return;
    const fetchIntentions = async () => {
      setIntentionsLoading(true);
      const result = await getIntentions(item.id);
      setIntentionsLoading(false);
      if (result.success && result.data) {
        setIntentions(result.data);
      } else {
        setIntentions([]);
      }
    };
    fetchIntentions();
  }, [isOpen, item, currentUser?.id]);

  if (!isOpen || !item) return null;

  const selectedBuyerId = item.selectedBuyerId ?? item.buyerId ?? null;
  const AvatarButton = ({
    userId,
    children,
    className,
  }: {
    userId: string;
    children: React.ReactNode;
    className?: string;
  }) =>
    onViewUserProfile ? (
      <button
        type="button"
        onClick={() => onViewUserProfile(userId)}
        className={className}
        aria-label="查看用户资料"
      >
        {children}
      </button>
    ) : (
      <div className={className}>{children}</div>
    );
  const isSeller = currentUser?.id === item.user?.id;
  const isBuyer = selectedBuyerId === currentUser?.id;
  const hasSubmittedIntention = item.hasSubmittedIntention ?? localHasSubmittedIntention;
  const isLocked = item.status === "LOCKED";
  const isCompleted = item.status === "COMPLETED";
  const isActive = item.status === "ACTIVE";
  const isExpired = item.status === "EXPIRED";
  const isDeleted = item.status === "DELETED";
  const hasBuyer = !!selectedBuyerId;

  /** 买家视角：商品不可用（已售出/已失效/已下架） */
  const isUnavailableForBuyer =
    !isSeller &&
    ((isCompleted && selectedBuyerId !== currentUser?.id) ||
      isExpired ||
      isDeleted ||
      item.isHidden === true);
  const unavailableBannerLabel = isUnavailableForBuyer
    ? isCompleted && selectedBuyerId !== currentUser?.id
      ? "该商品已售出"
      : isExpired
        ? "该商品已失效"
        : "该商品已下架"
    : null;
  const myConfirmed = isSeller ? item.sellerConfirmed : item.buyerConfirmed;
  const loading = actionId === item.id || submittingIntentionId === item.id || deletingItemId === item.id;

  /** 卖家联系方式：仅卖家本人、或已提交意向的潜在买家、或已选定的买家可见 */
  const showSellerContact =
    variant === "profile"
      ? isSeller || isBuyer
      : isSeller || hasSubmittedIntention || isBuyer;

  const handleDelete = () => {
    if (onDelete && confirm("确定要删除该商品吗？")) {
      onDelete(item.id);
    }
  };

  const isMapCentric = variant === "map";
  const overlayZ = isMapCentric ? "z-[200]" : "z-modal-overlay";
  const contentZ = isMapCentric ? "z-[210]" : "z-modal-content";

  const content = (
    <div className={`fixed inset-0 ${overlayZ} modal-overlay bg-black/50`}>
      <div className={`modal-container ${contentZ}`}>
        <div className="modal-header flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold text-[#1A1A1B]">商品详情</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="modal-body space-y-4 p-4 scrollbar-gutter-stable">
          {unavailableBannerLabel && (
            <div className="rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-center text-sm font-medium text-gray-600">
              {unavailableBannerLabel}
            </div>
          )}
          <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-100">
            {item.images.length > 0 ? (
              <Image
                src={item.images[0]}
                alt={item.title}
                fill
                className={`object-cover transition-all ${isUnavailableForBuyer ? "grayscale opacity-50" : ""}`}
                unoptimized={item.images[0].startsWith("blob:")}
              />
            ) : (
              <div className={`flex h-full items-center justify-center text-gray-400 transition-all ${isUnavailableForBuyer ? "opacity-50" : ""}`}>
                <ShoppingBag className="h-16 w-16" />
              </div>
            )}
          </div>

          {/* 标题 + 价格：横向布局，左标题右价格 */}
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-semibold text-[#1A1A1B]">{item.title}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#FFE5DD] px-3 py-1 text-sm text-[#FF4500]">
                  {item.transactionType?.name ?? "—"}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                  {item.category?.name ?? "—"}
                </span>
                {(isLocked || isCompleted) && (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      isCompleted ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isCompleted ? "已完成" : "已锁定"}
                  </span>
                )}
              </div>
            </div>
            {item.transactionType?.code === "SALE" && item.price != null && (
              <div className="shrink-0 text-right">
                <span className="text-2xl font-bold text-orange-600">¥{item.price}</span>
              </div>
            )}
          </div>

          {/* 意向人数（社交证明与紧迫感） */}
          {(item.intentionsCount ?? 0) >= 0 && (
            <div
              className={
                (item.intentionsCount ?? 0) > 5
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-1.5 text-sm font-medium text-orange-700"
                  : "inline-flex items-center gap-1.5 text-sm text-gray-600"
              }
            >
              {(item.intentionsCount ?? 0) > 5 && <Flame className="h-4 w-4 text-orange-500" />}
              <span>已有 {item.intentionsCount ?? 0} 人表达意向</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="h-4 w-4 shrink-0" />
            {item.poi?.name ?? "—"}
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {item.description}
          </div>

          {/* 卖家信息（可点击查看资料）+ 声誉徽章 */}
          {item.user && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <AvatarButton
                userId={item.user.id}
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200 ring-0 focus:ring-2 focus:ring-[#FF4500] focus:ring-offset-1"
              >
                <User className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-gray-500" />
              </AvatarButton>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#1A1A1B]">
                    {item.user.nickname ?? "匿名用户"}
                  </span>
                  {item.sellerReputation && item.sellerReputation.totalEvaluations > 0 ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        (item.sellerReputation.approvalRate ?? 0) >= 80
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      好评率 {item.sellerReputation.approvalRate}% ({item.sellerReputation.totalEvaluations}条评价)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      暂无评价
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">卖家联系方式</label>
            {showSellerContact ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <Phone className="h-4 w-4 text-[#FF4500]" />
                {item.contact || "未填写"}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                {variant === "profile"
                  ? item.contact || "未填写"
                  : "提交意向后可查看卖家联系方式"}
              </div>
            )}
          </div>

          {/* 卖家：有意向的人 */}
          {isSeller && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">有意向的人</label>
              {isLocked || isCompleted ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <span className="font-medium text-amber-800">
                    已锁定与 {(item.selectedBuyer ?? item.buyer)?.nickname ?? "未知用户"}
                    {item.buyerThumbsUpRate != null && (
                      <span className="ml-1.5 font-normal text-amber-700">
                        好评率 {item.buyerThumbsUpRate}%
                      </span>
                    )}
                  </span>
                </div>
              ) : intentionsLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  <span className="text-sm text-gray-500">加载中...</span>
                </div>
              ) : intentions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  暂无意向
                </div>
              ) : (
                <div className="space-y-2">
                  {intentions.map((intention) => (
                    <div
                      key={intention.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                    >
                      <AvatarButton
                        userId={intention.userId}
                        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200 ring-0 focus:ring-2 focus:ring-[#FF4500] focus:ring-offset-1"
                      >
                        {intention.user.avatar ? (
                          <Image
                            src={intention.user.avatar}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="40px"
                            unoptimized={intention.user.avatar.startsWith("blob:")}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-500">
                            <User className="h-5 w-5" />
                          </div>
                        )}
                      </AvatarButton>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[#1A1A1B]">
                          {intention.user.nickname ?? "匿名用户"}
                        </p>
                        {intention.reputation && intention.reputation.totalEvaluations > 0 ? (
                          <p
                            className={`mt-0.5 text-xs ${
                              (intention.reputation.approvalRate ?? 0) >= 80
                                ? "text-green-600"
                                : "text-gray-600"
                            }`}
                          >
                            好评率 {intention.reputation.approvalRate}% ({intention.reputation.totalEvaluations}条评价)
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-gray-500">暂无评价</p>
                        )}
                        <p className="mt-0.5 text-xs text-gray-600">
                          {intention.contactInfo || "未填写联系方式"}
                        </p>
                      </div>
                      {onSelectBuyerAndLock && (
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await onSelectBuyerAndLock(item.id, intention.userId);
                            if (result.success) {
                              onIntentionSubmitted?.();
                            }
                          }}
                          disabled={loading || selectingBuyerId === intention.userId || !!selectingBuyerId}
                          className="shrink-0 rounded-lg bg-[#FF4500] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {selectingBuyerId === intention.userId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "选定并锁定"
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 我有意向：联系方式输入表单（market/map 均支持，不可用商品不显示） */}
          {(variant === "market" || variant === "map") && !isSeller && !isUnavailableForBuyer && !isLocked && !hasSubmittedIntention && !selectedBuyerId && showIntentionForm && onSubmitIntention && (
            <div className="rounded-lg border border-[#FFE5DD] bg-[#FFFAF8] p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">
                请填写您的联系方式，方便卖家与您联系
              </p>
              <textarea
                value={intentionContactInput}
                onChange={(e) => setIntentionContactInput(e.target.value)}
                placeholder="手机号、微信号或其他联系方式（选填）"
                maxLength={200}
                rows={2}
                className="mb-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!onSubmitIntention) return;
                    const result = await onSubmitIntention(item.id, intentionContactInput.trim() || null);
                    if (result.success) {
                      setLocalHasSubmittedIntention(true);
                      setShowIntentionForm(false);
                      setIntentionContactInput("");
                      onIntentionSubmitted?.();
                    }
                  }}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  提交意向
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowIntentionForm(false);
                    setIntentionContactInput("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            发布于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}，有效期至{" "}
            {new Date(item.expiresAt).toLocaleDateString("zh-CN")}
          </div>

          {variant === "profile" && isLocked && !isCompleted && (
            <div className="flex items-center gap-2">
              {myConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  <CheckCircle className="h-3.5 w-3.5" />
                  你已确认
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  等待对方确认
                </span>
              )}
            </div>
          )}

          {/* 交易完成后评价（一次性） */}
          {variant === "profile" && isCompleted && onRate && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              {isSeller && item.sellerRatingOfBuyer == null ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">评价买家：</span>
                  <button
                    type="button"
                    onClick={() => onRate(item.id, true)}
                    disabled={loading || ratingId === item.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    {ratingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                    好评
                  </button>
                  <button
                    type="button"
                    onClick={() => onRate(item.id, false)}
                    disabled={loading || ratingId === item.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    差评
                  </button>
                </div>
              ) : isBuyer && item.buyerRatingOfSeller == null ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">评价卖家：</span>
                  <button
                    type="button"
                    onClick={() => onRate(item.id, true)}
                    disabled={loading || ratingId === item.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    {ratingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                    好评
                  </button>
                  <button
                    type="button"
                    onClick={() => onRate(item.id, false)}
                    disabled={loading || ratingId === item.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    差评
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-500">您已评价</span>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer flex flex-wrap gap-2 p-4">
          {variant === "profile" ? (
            <>
              {isSeller && (
                <>
                  {isLocked && onUnlock && (
                    <button
                      onClick={() => onUnlock(item.id)}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      重新上架
                    </button>
                  )}
                  {isLocked && !myConfirmed && onConfirm && (
                    <button
                      onClick={() => onConfirm(item.id)}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      确认交易完成
                    </button>
                  )}
                  {isActive && onEdit && (
                    <button
                      onClick={onEdit}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                      编辑
                    </button>
                  )}
                  {onDelete && item.status !== "DELETED" && (
                    <button
                      onClick={handleDelete}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      删除
                    </button>
                  )}
                </>
              )}
              {isBuyer && isLocked && !myConfirmed && onConfirm && (
                <button
                  onClick={() => onConfirm(item.id)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  确认交易完成
                </button>
              )}
              {onViewOnMap && (
                <button
                  onClick={onViewOnMap}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  <MapPin className="h-4 w-4" />
                  在地图中查看
                </button>
              )}
            </>
          ) : (
            <>
              {isSeller ? (
                <>
                  {onViewOnMap && (
                    <button
                      onClick={onViewOnMap}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#E03D00]"
                    >
                      <MapPin className="h-4 w-4" />
                      在地图中查看
                    </button>
                  )}
                  <button
                    className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    onClick={onEdit ?? (() => {})}
                  >
                    <Pencil className="h-4 w-4" />
                    编辑
                  </button>
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      disabled={loading}
                      className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      删除
                    </button>
                  )}
                </>
              ) : (
                <>
                  {hasSubmittedIntention || selectedBuyerId === currentUser?.id ? (
                    <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
                      <Eye className="h-4 w-4" />
                      {selectedBuyerId === currentUser?.id ? "您已被卖家选定" : "已提交意向，卖家联系方式已展示"}
                    </div>
                  ) : (
                    !selectedBuyerId &&
                    !isUnavailableForBuyer &&
                    !isLocked &&
                    onSubmitIntention &&
                    !showIntentionForm && (
                      <button
                        onClick={() => setShowIntentionForm(true)}
                        disabled={loading}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#E03D00] disabled:opacity-50"
                      >
                        我有意向
                      </button>
                    )
                  )}
                  {onViewOnMap && (
                    <button
                      onClick={onViewOnMap}
                      className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <MapPin className="h-4 w-4" />
                      在地图中查看
                    </button>
                  )}
                  {onReport && (
                    <button
                      onClick={onReport}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      举报
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
