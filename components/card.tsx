/**
 * Card 组件
 * 用于包装内容，提供统一的卡片样式（对齐 docs/前端设计规范.md §4.8）
 */

import { cn } from "@/lib/core/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function Card({ children, className = "", title, description, action }: CardProps) {
  const hasHeader = !!title || !!description || !!action;

  return (
    <div
      className={cn(
        "rounded-xl border border-[#EDEFF1] bg-white shadow-sm",
        className
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between border-b border-[#EDEFF1] px-6 py-4">
          <div className="flex flex-col">
            {title && (
              <h3 className="text-lg font-semibold text-[#1A1A1B]">{title}</h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-[#7C7C7C]">{description}</p>
            )}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
