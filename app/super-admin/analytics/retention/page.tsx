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
import {
  getDauWauMauTrend,
  getRetentionTrend,
  getDormantTrend,
  type TimeSeriesPoint,
} from "@/lib/admin-analytics-actions";

export default function RetentionAnalyticsPage() {
  const [days, setDays] = useState<Granularity>(30);
  const [dauWau, setDauWau] = useState<{ date: string; dau: number; wau: number; mau: number }[]>([]);
  const [retention, setRetention] = useState<{ date: string; retention7d: number; retention30d: number }[]>([]);
  const [dormant, setDormant] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [r1, r2, r3] = await Promise.all([
          getDauWauMauTrend(days),
          getRetentionTrend(days),
          getDormantTrend(days),
        ]);
        if (r1.success) setDauWau(r1.data);
        if (r2.success) setRetention(r2.data);
        if (r3.success) setDormant(r3.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days]);

  return (
    <div className="space-y-6">
      <ChartCard
        title="DAU / WAU / MAU 趋势"
        description="日活、周活、月活用户数，基于留言、集市、失物招领等行为"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dauWau}>
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
                dataKey="dau"
                name="日活 (DAU)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="wau"
                name="周活 (WAU)"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="mau"
                name="月活 (MAU)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="7日 / 30日留存率趋势"
        description="注册用户留存率（近似值），可用于评估产品粘性"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={retention}>
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
                formatter={(v, name) => [`${v ?? 0}%`, name === "retention7d" ? "7日留存" : "30日留存"]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="retention7d"
                name="7日留存"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="retention30d"
                name="30日留存"
                stroke="#ec4899"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="沉默用户趋势"
        description="注册满 30 天且近 30 天无任何行为，可考虑召回运营"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dormant}>
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
                formatter={(v) => [v ?? 0, "沉默用户"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
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
