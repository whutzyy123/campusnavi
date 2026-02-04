/**
 * POI 工具函数
 * 用于处理 POI 相关的业务逻辑
 */

import { Utensils, BookOpen, Building2, Package, Dumbbell, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type POICategory = "餐饮" | "教学" | "办公" | "快递" | "运动" | "其他";

export type POIStatus = "空闲" | "正常" | "拥挤" | "爆满";

export interface POI {
  id: string;
  schoolId: string;
  name: string;
  category: POICategory;
  lat: number;
  lng: number;
  isOfficial: boolean;
  description?: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface POIWithStatus extends POI {
  currentStatus?: {
    statusType: string;
    val: number;
    expiresAt: string;
    sampleCount?: number; // 统计样本数量（基于最近15分钟内的上报）
  };
}

/**
 * 根据分类获取图标
 */
export function getCategoryIcon(category: POICategory): LucideIcon {
  const iconMap: Record<POICategory, LucideIcon> = {
    餐饮: Utensils,
    教学: BookOpen,
    办公: Building2,
    快递: Package,
    运动: Dumbbell,
    其他: MoreHorizontal,
  };
  return iconMap[category] || MoreHorizontal;
}

/**
 * 根据分类获取图标颜色
 */
export function getCategoryColor(category: POICategory): string {
  const colorMap: Record<POICategory, string> = {
    餐饮: "#ff6b6b",
    教学: "#4ecdc4",
    办公: "#45b7d1",
    快递: "#f9ca24",
    运动: "#6c5ce7",
    其他: "#95a5a6",
  };
  return colorMap[category] || "#95a5a6";
}

/**
 * 根据状态值获取状态文本
 */
export function getStatusText(val: number): POIStatus {
  const statusMap: Record<number, POIStatus> = {
    1: "空闲",
    2: "正常",
    3: "拥挤",
    4: "爆满",
  };
  return statusMap[val] || "正常";
}

/**
 * 根据状态值获取状态颜色
 */
export function getStatusColor(val: number): string {
  const colorMap: Record<number, string> = {
    1: "#52c41a", // 绿色 - 空闲
    2: "#1890ff", // 蓝色 - 正常
    3: "#faad14", // 橙色 - 拥挤
    4: "#ff4d4f", // 红色 - 爆满
  };
  return colorMap[val] || "#1890ff";
}

/**
 * 根据状态值获取 Marker 颜色（用于地图显示）
 * 直接使用 getStatusColor，确保颜色映射一致
 */
export function getMarkerColor(val?: number): string {
  if (!val) {
    return "#1890ff"; // 默认蓝色（正常状态）
  }
  
  // 直接使用 getStatusColor，确保颜色映射一致
  return getStatusColor(val);
}

/**
 * 状态统计结果接口
 */
export interface StatusStatistics {
  val: number; // 计算后的状态值（1-4）
  sampleCount: number; // 样本数量
  averageScore: number; // 平均分（用于调试）
}

/**
 * 计算 POI 状态统计（基于过去15分钟内的所有上报）
 * 
 * 算法逻辑：
 * 1. 收集过去15分钟内所有有效的状态上报记录
 * 2. 将状态值映射为数值：空闲(1) -> 0, 正常(2) -> 1, 拥挤(3) -> 2, 爆满(4) -> 3
 * 3. 计算所有记录的平均分
 * 4. 将平均分四舍五入后映射回状态值（0 -> 1, 1 -> 2, 2 -> 3, 3 -> 4）
 * 5. 如果没有记录，返回默认值（正常，即2）
 * 
 * @param statusRecords 状态记录数组，每个记录包含 val 字段
 * @returns 统计结果，包含计算后的状态值和样本数量
 */
export function calculateStatusStatistics(
  statusRecords: Array<{ val: number }>
): StatusStatistics {
  // 如果没有记录，返回默认值（正常）
  if (!statusRecords || statusRecords.length === 0) {
    return {
      val: 2, // 默认正常
      sampleCount: 0,
      averageScore: 1, // 对应"正常"的数值
    };
  }

  // 将状态值映射为数值：1(空闲) -> 0, 2(正常) -> 1, 3(拥挤) -> 2, 4(爆满) -> 3
  const statusToScore = (val: number): number => {
    // 确保值在有效范围内
    if (val < 1) return 1;
    if (val > 4) return 3;
    return val - 1; // 1->0, 2->1, 3->2, 4->3
  };

  // 计算所有记录的平均分
  const scores = statusRecords.map((record) => statusToScore(record.val));
  const sum = scores.reduce((acc, score) => acc + score, 0);
  const averageScore = sum / scores.length;

  // 四舍五入到最近的整数
  const roundedScore = Math.round(averageScore);

  // 将分数映射回状态值：0 -> 1, 1 -> 2, 2 -> 3, 3 -> 4
  const scoreToStatus = (score: number): number => {
    // 确保值在有效范围内
    if (score < 0) return 1;
    if (score > 3) return 4;
    return score + 1; // 0->1, 1->2, 2->3, 3->4
  };

  const finalVal = scoreToStatus(roundedScore);

  return {
    val: finalVal,
    sampleCount: statusRecords.length,
    averageScore: averageScore,
  };
}

