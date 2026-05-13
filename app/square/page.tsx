"use client";

import { Compass, Sparkles } from "lucide-react";

export default function SquarePage() {
  return (
    <div className="min-h-full bg-[#F6F7F8] px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#EDEFF1] bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFE5DD]/70 text-[#FF4500]">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A1B]">广场</h1>
        <p className="mt-2 text-sm leading-6 text-[#7C7C7C]">
          这里是广场功能预留页，后续可承载校园动态流、话题讨论、活动聚合等能力。
        </p>
        <div className="mt-6 rounded-xl border border-dashed border-[#FF4500]/30 bg-[#FFF7F3] p-4 text-sm text-[#A64B2A]">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" />
            功能建设中
          </div>
          <p className="mt-1 text-xs">当前版本为占位页面，用于完成底部 Tab 导航结构。</p>
        </div>
      </div>
    </div>
  );
}

