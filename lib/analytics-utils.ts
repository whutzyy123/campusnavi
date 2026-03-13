/**
 * 数据分析页通用工具函数
 */

/** 图表 X 轴日期格式：3/11 */
export function formatChartDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

/** Tooltip 日期格式：2025年3月11日 */
export function formatTooltipDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y}年${parseInt(m, 10)}月${parseInt(day, 10)}日`;
}

/** Recharts Tooltip labelFormatter 兼容：接收 label 可能为 ReactNode */
export function tooltipLabelFormatter(label: unknown): string {
  if (typeof label === "string") return formatTooltipDate(label);
  return String(label ?? "");
}
