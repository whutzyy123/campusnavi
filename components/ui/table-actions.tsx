"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TableActionVariant = "default" | "destructive";

export interface TableActionItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: TableActionVariant;
  disabled?: boolean;
}

export interface TableActionsProps {
  /** 操作项列表，支持分组（通过 separator 分隔） */
  items: (TableActionItem | "separator")[];
  /** 是否禁用触发器 */
  disabled?: boolean;
  /** 触发器额外类名 */
  triggerClassName?: string;
  /** 内容区对齐方式：默认 end 靠右 */
  align?: "start" | "center" | "end";
  /** 内容区侧边对齐 */
  side?: "top" | "right" | "bottom" | "left";
  /** 自定义触发器（可选） */
  trigger?: React.ReactNode;
}

/**
 * 表格操作下拉菜单
 * 使用三点图标触发，支持动态菜单项与分组
 *
 * @example
 * ```tsx
 * <TableRow>
 *   <TableCell>{row.name}</TableCell>
 *   <TableCell>
 *     <TableActions
 *       items={[
 *         { label: "编辑", icon: Pencil, onClick: () => handleEdit(row) },
 *         { label: "查看", icon: Eye, onClick: () => handleView(row) },
 *         "separator",
 *         { label: "删除", icon: Trash2, onClick: () => handleDelete(row), variant: "destructive" },
 *       ]}
 *     />
 *   </TableCell>
 * </TableRow>
 * ```
 */
export function TableActions({
  items,
  disabled = false,
  triggerClassName,
  align = "end",
  side = "bottom",
  trigger,
}: TableActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 disabled:pointer-events-none disabled:opacity-50",
              triggerClassName
            )}
            aria-label="更多操作"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align={align}
          side={side}
          sideOffset={4}
          className="z-tooltip-popover min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
        {items.map((item, idx) =>
          item === "separator" ? (
            <DropdownMenuSeparator key={`sep-${idx}`} className="my-1 bg-gray-100" />
          ) : (
            <DropdownMenuItem
              key={idx}
              onSelect={() => {
                if (!item.disabled) item.onClick();
              }}
              disabled={item.disabled}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                item.variant === "destructive"
                  ? "text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
                  : "text-gray-700"
              )}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              {item.label}
            </DropdownMenuItem>
          )
        )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
