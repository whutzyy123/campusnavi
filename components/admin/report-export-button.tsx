"use client";

import { useState } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { exportReportCsv, type ReportPeriod } from "@/lib/admin-report-actions";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "week", label: "周报（近7天）" },
  { value: "month", label: "月报（近30天）" },
  { value: "year", label: "年报（近365天）" },
];

/**
 * 报表导出按钮：周报/月报/年报 CSV 下载
 */
export function ReportExportButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ReportPeriod | null>(null);

  const handleExport = async (period: ReportPeriod) => {
    setExporting(period);
    try {
      const result = await exportReportCsv(period);
      if (!result.success) {
        toast.error(result.error || "导出失败");
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("导出成功");
      setOpen(false);
    } catch (e) {
      toast.error("导出失败，请重试");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <Download className="h-4 w-4" />
        导出报表
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handleExport(p.value)}
                disabled={exporting !== null}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {p.label}
                {exporting === p.value && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
