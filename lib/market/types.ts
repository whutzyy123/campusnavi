/** 按交易类型 ID 分组的物品分类（用户端） */
export type MarketCategoriesByType = Record<
  number,
  Array<{ id: string; name: string; order: number }>
>;

/** 集市分类与交易类型（用于发布表单等） */
export interface MarketCategoriesResult {
  data: MarketCategoriesByType;
  transactionTypes: Array<{ id: number; name: string; code: string; order: number }>;
}

export interface MarketActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export function safeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** 用户集市声誉（按角色聚合） */
export interface UserReputation {
  totalEvaluations: number;
  goodRatings: number;
  approvalRate: number | null;
}

/** 公开集市商品列表项 */
export interface PublicMarketItemEntry {
  id: string;
  poiId: string;
  categoryId: string | null;
  typeId: number;
  transactionType: { id: number; name: string; code: string };
  title: string;
  description: string;
  price: number | null;
  images: string[];
  status: string;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
}

/** 公开集市商品详情（含 hasSubmittedIntention、masked、intentionsCount 等） */
export interface PublicMarketItemDetail extends PublicMarketItemEntry {
  contact: string | null;
  user: { id: string; nickname: string | null };
  selectedBuyerId: string | null;
  buyerId: string | null;
  buyer: { id: string; nickname: string | null } | null;
  selectedBuyer: { id: string; nickname: string | null } | null;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  lockedAt: string | null;
  hasSubmittedIntention: boolean;
  intentionsCount: number;
  buyerRatingOfSeller?: boolean | null;
  sellerRatingOfBuyer?: boolean | null;
  sellerThumbsUpRate?: number;
  buyerThumbsUpRate?: number;
  sellerReputation?: UserReputation;
  masked?: boolean;
  message?: string;
}

export interface MarketItemResult {
  id: string;
  poiId: string;
  categoryId: string | null;
  typeId: number;
  title: string;
  description: string;
  contact: string | null;
  price: number | null;
  images: string[];
  status: string;
  reportCount: number;
  expiresAt: string;
  createdAt: string;
}

/** 中控台集市列表项（与 API 返回格式一致） */
export interface MyMarketItemEntry {
  id: string;
  title: string;
  price: number | null;
  images: string[];
  status: string;
  buyerId?: string | null;
  selectedBuyerId: string | null;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  lockedAt: string | null;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
  category: { id: string; name: string } | null;
  transactionType: { id: number; name: string; code: string };
  buyer?: { id: string; nickname: string | null } | null;
  seller?: { id: string; nickname: string | null } | null;
  hasIntention?: boolean;
  buyerRatingOfSeller?: boolean | null;
  sellerRatingOfBuyer?: boolean | null;
}

/** 集市活动分组 */
export interface MyMarketItemsResult {
  selling: MyMarketItemEntry[];
  buying: MyMarketItemEntry[];
}

/** 意向记录（含用户信息与买家声誉） */
export interface MarketIntentionWithUser {
  id: number;
  itemId: string;
  userId: string;
  contactInfo: string | null;
  createdAt: string;
  user: { id: string; nickname: string | null; avatar: string | null };
  reputation?: UserReputation;
}

/** 管理员审计轨迹返回结构 */
export interface AdminItemAuditTrailResult {
  item: {
    id: string;
    title: string;
    status: string;
    category: { id: string; name: string } | null;
    seller: { id: string; nickname: string | null; avatar: string | null; email: string | null };
  };
  history: Array<{
    timestamp: string;
    user: { avatar: string | null; nickname: string | null; email: string | null; role?: number };
    action: string;
    details: string | null;
  }>;
}

/** 管理端集市商品列表项 */
export interface AdminMarketItemRow {
  id: string;
  title: string;
  typeId: number;
  transactionType: { id: number; name: string; code: string };
  status: string;
  reportCount: number;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null; email: string | null };
  buyer: { id: string; nickname: string | null; email: string | null } | null;
  buyerId: string | null;
  category: { id: string; name: string } | null;
  poi: { id: string; name: string } | null;
  images: string[];
  price: number | null;
}

/** 集市分类配置（超管用） */
export interface AdminMarketCategoriesConfig {
  categories: Array<{
    id: string;
    name: string;
    order: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    _count: { marketItems: number };
  }>;
  typeLinks: Record<string, number[]>;
  transactionTypes: Array<{ id: number; name: string; code: string; order: number; isActive: boolean }>;
}

/** 创建集市商品 DTO */
export interface CreateMarketItemDTO {
  poiId: string;
  categoryId?: string | null;
  typeId: number;
  title: string;
  description: string;
  contact?: string | null;
  price?: number | null;
  images: string[];
}

import { z } from "zod";

const MAX_IMAGES = 9;

export const UpdateMarketItemPayloadSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(2000).optional(),
  price: z.number().min(0).nullable().optional(),
  images: z.array(z.string()).max(MAX_IMAGES).optional(),
  categoryId: z.string().nullable().optional(),
  poiId: z.string().min(1).optional(),
  contact: z.string().max(100).nullable().optional(),
});

export type UpdateMarketItemPayload = z.infer<typeof UpdateMarketItemPayloadSchema>;
