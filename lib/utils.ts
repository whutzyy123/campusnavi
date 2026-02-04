import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 分页查询辅助函数
 * @param page 页码（从1开始）
 * @param limit 每页数量
 * @returns Prisma 查询参数 { skip, take }
 */
export function getPaginationParams(page: number, limit: number) {
  const pageNum = Math.max(1, Math.floor(page));
  const limitNum = Math.max(1, Math.floor(limit));
  
  return {
    skip: (pageNum - 1) * limitNum,
    take: limitNum,
  };
}

/**
 * 计算分页元数据
 * @param total 总记录数
 * @param page 当前页码
 * @param limit 每页数量
 * @returns 分页元数据
 */
export function getPaginationMeta(total: number, page: number, limit: number) {
  const pageNum = Math.max(1, Math.floor(page));
  const limitNum = Math.max(1, Math.floor(limit));
  const pageCount = Math.ceil(total / limitNum);
  
  return {
    total,
    pageCount,
    currentPage: pageNum,
    limit: limitNum,
  };
}

