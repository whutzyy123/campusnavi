"use client";

import { cn } from "@/lib/core/utils";

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

export function FormFieldInputClass(hasError = false) {
  return cn(
    "w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
    hasError ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-[#FF4500]"
  );
}

