"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY_PREFIX = "campus_search_history_";
const MAX_HISTORY_ITEMS = 10;

function getStorageKey(schoolId: string | null): string {
  return `${STORAGE_KEY_PREFIX}${schoolId ?? "global"}`;
}

function loadHistory(schoolId: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(schoolId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_HISTORY_ITEMS)
      : [];
  } catch {
    return [];
  }
}

function saveHistory(schoolId: string | null, items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(schoolId), JSON.stringify(items));
  } catch {
    // ignore quota / security errors
  }
}

/**
 * 搜索历史 Hook（按 schoolId 隔离，多租户安全）
 * @param schoolId 当前学校 ID，SuperAdmin 无学校时为 null
 */
export function useSearchHistory(schoolId: string | null) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory(schoolId));
  }, [schoolId]);

  const addToHistory = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      setHistory((prev) => {
        const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX_HISTORY_ITEMS);
        saveHistory(schoolId, next);
        return next;
      });
    },
    [schoolId]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory(schoolId, []);
  }, [schoolId]);

  return { history, addToHistory, clearHistory };
}
