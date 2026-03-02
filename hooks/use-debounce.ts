"use client";

import { useEffect, useState } from "react";

/**
 * Debounces a value by the specified delay.
 * The returned value updates only after the input has been stable for `delay` ms.
 *
 * @param value - The value to debounce (any type)
 * @param delay - Delay in milliseconds (default: 300)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
