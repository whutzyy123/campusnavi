export type MarketSubTab = "posted" | "interested" | "locked" | "acquired" | "history";
export type MarketRole = "seller" | "buyer";
export type MarketStatusFilter = "all" | "ongoing" | "ended";

export const SELLING_STATUS_FILTERS: { id: MarketStatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "ongoing", label: "进行中" },
  { id: "ended", label: "已结束" },
];

export const BUYING_STATUS_FILTERS: { id: MarketStatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "ongoing", label: "进行中" },
  { id: "ended", label: "已结束" },
];

/** 集市交易商品项（我发布的 / 有意向的 / 曾有意向） */
export interface MarketTransactionItem {
  id: string;
  title: string;
  price: number | null;
  images: string[];
  status: string;
  buyerId: string | null;
  selectedBuyerId?: string | null;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  lockedAt: string | null;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
  transactionType: { id: number; name: string; code: string };
  buyer?: { id: string; nickname: string | null };
  seller?: { id: string; nickname: string | null };
  hasIntention?: boolean;
  isHidden?: boolean;
  buyerRatingOfSeller?: boolean | null;
  sellerRatingOfBuyer?: boolean | null;
}

/** 根据买家侧 item 推断 subTab（用于卡片操作按钮） */
export function getBuyerSubTab(item: MarketTransactionItem, currentUserId: string): MarketSubTab {
  if (item.status === "LOCKED" && item.selectedBuyerId === currentUserId) return "locked";
  if (item.status === "COMPLETED" && item.selectedBuyerId === currentUserId) return "acquired";
  if (item.status === "ACTIVE" && (item.hasIntention ?? true) && item.selectedBuyerId !== currentUserId)
    return "interested";
  return "history";
}
