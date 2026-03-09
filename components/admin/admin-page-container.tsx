"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";

export interface AdminPageContainerProps {
  /** 面包屑。若 AdminLayout 已提供全局面包屑，可传 null 避免重复 */
  breadcrumbs?: React.ReactNode | null;
  title: string;
  description?: string;
  headerActions?: React.ReactNode;
  /** 可选：粘性头部额外内容（如 Tabs），置于标题下方 */
  headerExtra?: React.ReactNode;
  /** 可选：底部固定区域 */
  footer?: React.ReactNode;
  /** 可选：变化时重置内容区滚动到顶部（如分页页码） */
  scrollKey?: string | number;
  children: React.ReactNode;
}

export function AdminPageContainer({
  breadcrumbs,
  title,
  description,
  headerActions,
  headerExtra,
  footer,
  scrollKey,
  children,
}: AdminPageContainerProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 分页等切换时重置滚动到顶部
  useEffect(() => {
    const el = bodyRef.current;
    if (el && scrollKey !== undefined) el.scrollTop = 0;
  }, [scrollKey]);

  const handleScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setIsScrolled(el.scrollTop > 0);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full overflow-hidden"
    >
      {/* Header Section (Fixed) - shadow when scrolled */}
      <header
        className={`flex-none p-6 pb-2 transition-shadow transition-colors duration-200 ${
          isScrolled ? "bg-white shadow-md border-b border-gray-200" : ""
        }`}
      >
        <div className="flex flex-col gap-2">
          {breadcrumbs != null && breadcrumbs}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-gray-500">{description}</p>
              )}
            </div>
            {headerActions && <div className="flex-shrink-0">{headerActions}</div>}
          </div>
          {headerExtra && <div className="mt-3">{headerExtra}</div>}
        </div>
      </header>

      {/* Content Section (Scrollable) */}
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 pt-2 custom-scrollbar"
      >
        {children}
      </div>

      {/* Footer Section (Fixed) */}
      {footer != null && (
        <footer className="flex-none border-t border-gray-200 bg-white p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          {footer}
        </footer>
      )}
    </motion.div>
  );
}
