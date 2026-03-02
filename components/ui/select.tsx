"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  /** 分组选项，与 options 二选一。当提供时，下拉框按组展示 */
  optionGroups?: SelectOptionGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

/**
 * Select 组件：使用 Portal 将下拉渲染到 body，避免父级 overflow-hidden 裁剪
 */
/** 从扁平 options 或 optionGroups 中查找选中项的 label */
function findSelectedLabel(
  value: string,
  options?: SelectOption[],
  optionGroups?: SelectOptionGroup[]
): string | undefined {
  if (options) {
    return options.find((o) => o.value === value)?.label;
  }
  if (optionGroups) {
    for (const group of optionGroups) {
      const found = group.options.find((o) => o.value === value);
      if (found) return found.label;
    }
  }
  return undefined;
}

export function Select({
  value,
  onValueChange,
  options,
  optionGroups,
  placeholder = "请选择",
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const selectedLabel = findSelectedLabel(value, options, optionGroups) ?? placeholder;

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest("[data-select-content]")
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (opt: SelectOption) => {
    onValueChange(opt.value);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-gray-300 px-4 py-2 text-left text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName
        )}
      >
        <span className={cn(!value && "text-gray-500")}>{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-select-content
            className={cn(
              "fixed z-tooltip-popover max-h-[40vh] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg",
              contentClassName
            )}
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            {optionGroups ? (
              optionGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-4 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
                    {group.label}
                  </div>
                  {group.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full px-4 py-2 pl-6 text-left text-sm transition-colors hover:bg-gray-100 ${
                        opt.value === value ? "bg-[#FFE5DD] font-medium text-[#FF4500]" : ""
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              (options ?? []).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${
                    opt.value === value ? "bg-[#FFE5DD] font-medium text-[#FF4500]" : ""
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
