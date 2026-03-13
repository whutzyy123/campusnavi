"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ChartCard } from "@/components/admin/chart-card";
import { ChartLoadingState, ChartEmptyState } from "@/components/admin/chart-states";
import { AnalyticsGranularityTabs, type Granularity } from "@/components/admin/analytics-granularity-tabs";
import { formatChartDate, tooltipLabelFormatter } from "@/lib/analytics-utils";
import {
  getMarketListingsTrend,
  getMarketByType,
  getMarketBySchool,
} from "@/lib/admin-analytics-actions";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function BazaarAnalyticsPage() {
  const [days, setDays] = useState<Granularity>(30);
  const [trend, setTrend] = useState<{
    date: string;
    newListings: number;
    completed: number;
    expired: number;
  }[]>([]);
  const [byType, setByType] = useState<{ typeName: string; count: number }[]>([]);
  const [bySchool, setBySchool] = useState<{ schoolName: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [r1, r2, r3] = await Promise.all([
          getMarketListingsTrend(days),
          getMarketByType(),
          getMarketBySchool(),
        ]);
        if (r1.success) setTrend(r1.data);
        if (r2.success) setByType(r2.data);
        if (r3.success) setBySchool(r3.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days]);

  return (
    <div className="space-y-6">
      <ChartCard
        title="上架 / 成交 / 过期趋势"
        description="每日新上架、成交、过期商品数，反映供需动态"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip labelFormatter={tooltipLabelFormatter} />
              <Legend />
              <Line
                type="monotone"
                dataKey="newListings"
                name="新上架"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="completed"
                name="成交"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expired"
                name="过期"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="商品类型分布" description="在架商品按交易类型（求购/出售/求换等）">
          {loading ? (
            <ChartLoadingState />
          ) : byType.length === 0 ? (
            <ChartEmptyState message="暂无在架商品" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="count"
                  nameKey="typeName"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name} ${value}`}
                >
                  {byType.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [v ?? 0, "在架"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="各学校在架商品数" description="按学校分布，便于识别高活跃学校">
          {loading ? (
            <ChartLoadingState />
          ) : bySchool.length === 0 ? (
            <ChartEmptyState message="暂无在架商品" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={bySchool}
                layout="vertical"
                margin={{ left: 80, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  type="category"
                  dataKey="schoolName"
                  width={70}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <Tooltip formatter={(v) => [v ?? 0, "在架商品"]} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
