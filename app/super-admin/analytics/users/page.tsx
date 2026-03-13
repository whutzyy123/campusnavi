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
  BarChart,
  Bar,
} from "recharts";
import { ChartCard } from "@/components/admin/chart-card";
import { ChartLoadingState, ChartEmptyState } from "@/components/admin/chart-states";
import { AnalyticsGranularityTabs, type Granularity } from "@/components/admin/analytics-granularity-tabs";
import { formatChartDate, tooltipLabelFormatter } from "@/lib/analytics-utils";
import {
  getNewUsersTrend,
  getCumulativeUsersTrend,
  getNewUsersBySchool,
  type TimeSeriesPoint,
} from "@/lib/admin-analytics-actions";

export default function UsersAnalyticsPage() {
  const [days, setDays] = useState<Granularity>(30);
  const [newTrend, setNewTrend] = useState<TimeSeriesPoint[]>([]);
  const [cumTrend, setCumTrend] = useState<TimeSeriesPoint[]>([]);
  const [bySchool, setBySchool] = useState<{ schoolName: string; schoolId: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [r1, r2, r3] = await Promise.all([
          getNewUsersTrend(days),
          getCumulativeUsersTrend(days),
          getNewUsersBySchool(days),
        ]);
        if (r1.success) setNewTrend(r1.data);
        if (r2.success) setCumTrend(r2.data);
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
        title="新增用户趋势"
        description="每日新增注册用户数，可切换时间范围"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={newTrend}>
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
                formatter={(v) => [v ?? 0, "新增用户"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="累计用户趋势" description="每日累计注册用户总数">
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumTrend}>
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
                formatter={(v) => [v ?? 0, "累计用户"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="新增用户按学校分布"
        description={`近 ${days} 天各学校新增用户数，便于识别高增长学校`}
      >
        {loading ? (
          <ChartLoadingState />
        ) : bySchool.length === 0 ? (
          <ChartEmptyState message="暂无数据，请稍后再试" />
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
              <Tooltip
                formatter={(v) => [v ?? 0, "新增用户"]}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
