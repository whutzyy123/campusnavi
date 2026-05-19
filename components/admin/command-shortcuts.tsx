"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";

interface ShortcutItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface CommandShortcutsProps {
  title?: string;
  items: ShortcutItem[];
}

/**
 * 命令快捷入口：网格布局，简洁专业
 */
export function CommandShortcuts({
  title = "快捷入口",
  items,
}: CommandShortcutsProps) {
  return (
    <div className="rounded-xl border border-[#EDEFF1] border-t-[3px] border-t-[#FF4500] bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-[#1A1A1B]">{title}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg border border-[#EDEFF1] px-3 py-2.5 text-sm font-medium text-[#1A1A1B] transition-all hover:border-[#FF4500] hover:bg-[#FFF7F5] hover:text-[#FF4500] active:scale-[0.98]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[#7C7C7C] group-hover:text-[#FF4500]" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
