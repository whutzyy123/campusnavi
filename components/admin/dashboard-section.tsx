"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface DashboardSectionProps {
  title: string;
  description?: string;
  /** 查看详情链接 */
  detailHref?: string;
  children: React.ReactNode;
}

/**
 * 看板区块：分组展示统计卡片，支持标题与描述
 */
export function DashboardSection({
  title,
  description,
  detailHref,
  children,
}: DashboardSectionProps) {
  return (
    <section className="rounded-xl border border-[#EDEFF1] border-t-[3px] border-t-[#FF4500] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#1A1A1B]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-[#7C7C7C]">{description}</p>
          )}
        </div>
        {detailHref && (
          <Link
            href={detailHref}
            className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-[#FF4500] hover:text-[#E03E00] transition-colors"
          >
            查看详情
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
