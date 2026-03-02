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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            >
              <Icon className="h-4 w-4 shrink-0 text-gray-500" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
