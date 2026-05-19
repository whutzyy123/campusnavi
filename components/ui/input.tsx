"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/core/utils";

export function inputClassName(hasError = false, className?: string) {
  return cn(
    "w-full rounded-lg border px-4 py-2 text-sm",
    "focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
    hasError ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-[#FF4500]",
    className
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError = false, className, ...props },
  ref
) {
  return <input ref={ref} className={inputClassName(hasError, className)} {...props} />;
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { hasError = false, className, ...props },
  ref
) {
  return <textarea ref={ref} className={inputClassName(hasError, className)} {...props} />;
});
