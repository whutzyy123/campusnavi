"use client";

import { forwardRef } from "react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** 标签文本（可选） */
  label?: React.ReactNode;
}

/**
 * 复选框组件，使用项目主色 #FF4500
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", ...props }, ref) => {
    const inputClasses = `h-4 w-4 rounded border-gray-300 text-[#FF4500] focus:ring-2 focus:ring-[#FF4500]/20 focus:ring-offset-0 ${className}`.trim();

    if (label) {
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            ref={ref}
            type="checkbox"
            className={inputClasses}
            {...props}
          />
          <span className="text-sm text-gray-700">{label}</span>
        </label>
      );
    }

    return <input ref={ref} type="checkbox" className={inputClasses} {...props} />;
  }
);

Checkbox.displayName = "Checkbox";
