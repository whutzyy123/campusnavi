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
  getPoiTrend,
  getCommentsTrend,
  getContentBySchool,
  type TimeSeriesPoint,
} from "@/lib/admin-analytics-actions";

export default function ContentAnalyticsPage() {
  const [days, setDays] = useState<Granularity>(30);
  const [poiTrend, setPoiTrend] = useState<TimeSeriesPoint[]>([]);
  const [commentTrend, setCommentTrend] = useState<TimeSeriesPoint[]>([]);
  const [bySchool, setBySchool] = useState<{ schoolName: string; pois: number; comments: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [r1, r2, r3] = await Promise.all([
          getPoiTrend(days),
          getCommentsTrend(days),
          getContentBySchool(),
        ]);
        if (r1.success) setPoiTrend(r1.data);
        if (r2.success) setCommentTrend(r2.data);
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
        title="POI 新增趋势"
        description="每日新增地图点位（POI）数，反映地图覆盖增长"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={poiTrend}>
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
                formatter={(v) => [v ?? 0, "新增 POI"]}
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

      <ChartCard
        title="留言新增趋势"
        description="每日新增 POI 留言数，反映内容活跃度"
        granularity={
          <AnalyticsGranularityTabs value={days} onChange={setDays} />
        }
      >
        {loading ? (
          <ChartLoadingState />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={commentTrend}>
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
                formatter={(v) => [v ?? 0, "新增留言"]}
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
        title="各学校 POI 与留言"
        description="按学校分布，便于对比各校地图覆盖与内容活跃度"
      >
        {loading ? (
          <ChartLoadingState />
        ) : bySchool.length === 0 ? (
          <ChartEmptyState message="暂无数据，请稍后再试" />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={bySchool}
              margin={{ left: 80, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="category"
                dataKey="schoolName"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip />
              <Bar dataKey="pois" name="POI" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="comments" name="留言" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
