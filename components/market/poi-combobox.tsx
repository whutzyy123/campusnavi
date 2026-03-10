"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export interface POIOption {
  id: string;
  name: string;
  alias: string | null;
}

interface POIComboboxProps {
  schoolId: string;
  value: { id: string; name: string } | null;
  onChange: (poi: { id: string; name: string } | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export function POICombobox({
  schoolId,
  value,
  onChange,
  onBlur,
  placeholder = "搜索地点（如：越园）",
  disabled = false,
  error,
  className = "",
}: POIComboboxProps) {
  const [inputValue, setInputValue] = useState(value?.name ?? "");
  const debouncedInputValue = useDebounce(inputValue, 300);
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<POIOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const syncInputFromValue = useCallback(() => {
    if (value) {
      setInputValue(value.name);
    } else {
      setInputValue("");
    }
  }, [value]);

  useEffect(() => {
    syncInputFromValue();
  }, [value?.id, syncInputFromValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (!value && inputValue.trim()) {
          setInputValue("");
          onChange(null);
        }
        onBlur?.();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value, inputValue, onChange, onBlur]);

  const searchPois = useCallback(
    async (query: string) => {
      if (!schoolId || !query.trim()) {
        setOptions([]);
        setHasSearched(true);
        return;
      }
      setIsSearching(true);
      setHasSearched(true);
      try {
        const { searchPOIs } = await import("@/lib/poi-actions");
        const result = await searchPOIs(schoolId, { q: query.trim() });
        if (result.success && Array.isArray(result.data)) {
          setOptions(result.data);
        } else {
          setOptions([]);
        }
      } catch (e) {
        setOptions([]);
      } finally {
        setIsSearching(false);
      }
    },
    [schoolId]
  );

  useEffect(() => {
    if (!debouncedInputValue.trim()) {
      setOptions([]);
      setHasSearched(false);
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    searchPois(debouncedInputValue);
  }, [debouncedInputValue, searchPois]);

  const handleSelect = (poi: POIOption) => {
    onChange({ id: poi.id, name: poi.name });
    setInputValue(poi.name);
    setIsOpen(false);
    setOptions([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    if (value) {
      onChange(null);
    }
    if (!v.trim()) {
      setOptions([]);
      setHasSearched(false);
    }
  };

  const handleClear = () => {
    setInputValue("");
    onChange(null);
    setOptions([]);
    setHasSearched(false);
    setIsOpen(false);
  };

  const showDropdown = isOpen && inputValue.trim().length > 0;
  const showNoResults = showDropdown && hasSearched && !isSearching && options.length === 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`relative flex items-center rounded-lg border bg-white transition-colors ${
          error
            ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500/20"
            : "border-gray-300 focus-within:border-[#FF4500] focus-within:ring-2 focus-within:ring-[#FF4500]/20"
        } ${disabled ? "cursor-not-allowed bg-gray-50" : ""}`}
      >
        <Search className="absolute left-3 h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.trim() && setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full flex-1 border-0 bg-transparent py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
          autoComplete="off"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="清除"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
      {showDropdown && (
        <ul className="absolute left-0 right-0 top-full z-tooltip-popover mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {isSearching ? (
            <li className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </li>
          ) : showNoResults ? (
            <li className="px-4 py-3 text-sm text-gray-500">
              未找到匹配的地点，请尝试其他关键词。
            </li>
          ) : (
            options.map((poi) => (
              <li key={poi.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(poi)}
                  className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFE5DD]/50"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="font-medium text-gray-900">{poi.name}</span>
                  {poi.alias && (
                    <span className="text-xs text-gray-500">({poi.alias})</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
