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
} from "recharts";
import { ChartCard } from "@/components/admin/chart-card";
import { ChartLoadingState } from "@/components/admin/chart-states";
import { AnalyticsGranularityTabs, type Granularity } from "@/components/admin/analytics-granularity-tabs";
import { formatChartDate, tooltipLabelFormatter } from "@/lib/analytics-utils";
import { getNotificationsTrend } from "@/lib/admin-analytics-actions";

export default function HealthAnalyticsPage() {
  const [days, setDays] = useState<Granularity>(30);
  const [trend, setTrend] = useState<{
    date: string;
    total: number;
    read: number;
    readRate: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await getNotificationsTrend(days);
        if (r.success) setTrend(r.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days]);

  return (
    <div className="space-y-6">
      <ChartCard
        title="通知发送趋势"
        description="每日新增通知数与已读数，反映消息触达量"
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
              <Tooltip
                labelFormatter={tooltipLabelFormatter}
                formatter={(v, name) => [
                  v ?? 0,
                  name === "total" ? "发送数" : name === "read" ? "已读数" : "已读率",
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                name="发送数"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="read"
                name="已读数"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="通知已读率趋势"
        description="每日通知已读率，反映消息触达质量"
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
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                labelFormatter={tooltipLabelFormatter}
                formatter={(v) => [`${v ?? 0}%`, "已读率"]}
              />
              <Line
                type="monotone"
                dataKey="readRate"
                name="已读率"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
