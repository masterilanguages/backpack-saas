"use client";

import { SearchIcon } from "./Icons";
import { cn } from "@/lib/utils";

export interface FilterConfig {
  key: string;
  label: string;
  options: string[];
}

export default function SearchAndFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  filterValues,
  onFilterChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      {filters.map((filter) => (
        <select
          key={filter.key}
          value={filterValues[filter.key] ?? "all"}
          onChange={(e) => onFilterChange(filter.key, e.target.value)}
          className={cn(
            "rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500",
            (filterValues[filter.key] ?? "all") === "all"
              ? "text-slate-500"
              : "text-slate-900"
          )}
        >
          <option value="all">All {filter.label}</option>
          {filter.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
