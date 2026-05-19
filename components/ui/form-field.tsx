"use client";

import { inputClassName } from "@/components/ui/input";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

/** @deprecated 优先使用 Input / Textarea 组件 */
export function FormFieldInputClass(hasError = false) {
  return inputClassName(hasError);
}

