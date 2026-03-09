"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  total: number;
  pageCount: number;
  currentPage: number;
  limit?: number;
}

/**
 * 通用分页控件组件
 * Reddit 风格：简洁的上一页/下一页按钮 + 页码显示
 * 内部使用 useSearchParams，需 Suspense 包裹
 */
export function PaginationControls(props: PaginationControlsProps) {
  return (
    <Suspense fallback={<div className="h-8" />}>
      <PaginationControlsInner {...props} />
    </Suspense>
  );
}

function PaginationControlsInner({
  total,
  pageCount,
  currentPage,
  limit = 10,
}: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 更新 URL 查询参数
  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("page");
    } else {
      params.set("page", newPage.toString());
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  // 如果只有一页或没有数据，不显示分页控件
  if (pageCount <= 1 || total === 0) {
    return null;
  }

  // 生成页码数组（最多显示7个页码）
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    
    if (pageCount <= maxVisible) {
      // 如果总页数少于等于7，显示所有页码
      for (let i = 1; i <= pageCount; i++) {
        pages.push(i);
      }
    } else {
      // 复杂情况：显示省略号
      if (currentPage <= 3) {
        // 前3页：显示 1, 2, 3, 4, ..., 最后一页
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("ellipsis");
        pages.push(pageCount);
      } else if (currentPage >= pageCount - 2) {
        // 后3页：显示 1, ..., 倒数4页
        pages.push(1);
        pages.push("ellipsis");
        for (let i = pageCount - 3; i <= pageCount; i++) {
          pages.push(i);
        }
      } else {
        // 中间页：显示 1, ..., 当前页前后各1页, ..., 最后一页
        pages.push(1);
        pages.push("ellipsis");
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push("ellipsis");
        pages.push(pageCount);
      }
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex w-full items-center justify-center gap-1.5 py-1">
      {/* 上一页按钮 */}
      <button
        onClick={() => updatePage(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center gap-1 rounded-md border border-[#EDEFF1] bg-white px-2.5 py-1 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        aria-label="上一页"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">上一页</span>
      </button>

      {/* 页码按钮 */}
      <div className="flex items-center gap-1">
        {pageNumbers.map((page, index) => {
          if (page === "ellipsis") {
            return (
              <span
                key={`ellipsis-${index}`}
                className="px-1.5 text-xs text-[#7C7C7C]"
              >
                ...
              </span>
            );
          }

          const pageNum = page as number;
          const isActive = pageNum === currentPage;

          return (
            <button
              key={pageNum}
              onClick={() => updatePage(pageNum)}
              className={`min-w-[28px] rounded-md px-2 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#FF4500] text-white hover:bg-[#FF4500]/90"
                  : "border border-[#EDEFF1] bg-white text-[#1A1A1B] hover:bg-[#F6F7F8]"
              }`}
              aria-label={`第 ${pageNum} 页`}
              aria-current={isActive ? "page" : undefined}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      {/* 下一页按钮 */}
      <button
        onClick={() => updatePage(currentPage + 1)}
        disabled={currentPage === pageCount}
        className="flex items-center gap-1 rounded-md border border-[#EDEFF1] bg-white px-2.5 py-1 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        aria-label="下一页"
      >
        <span className="hidden sm:inline">下一页</span>
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* 页码信息（可选，显示在右侧） */}
      <div className="ml-2 hidden text-xs text-[#7C7C7C] sm:block">
        第 {currentPage} 页，共 {pageCount} 页
      </div>
    </div>
  );
}

