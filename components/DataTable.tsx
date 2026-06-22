"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@/lib/types";
import SearchAndFilters, { FilterConfig } from "./SearchAndFilters";
import EmptyState from "./EmptyState";
import ActionMenu from "./ActionMenu";
import { cn } from "@/lib/utils";

export default function DataTable<T extends { id: string }>({
  columns,
  rows,
  searchKeys,
  searchPlaceholder,
  filters = [],
  emptyTitle = "No records found",
  emptyDescription = "Try adjusting your search or filters.",
  showActions = true,
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  /** Object keys searched by the text input; falls back to all string values */
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  emptyTitle?: string;
  emptyDescription?: string;
  showActions?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      for (const f of filters) {
        const selected = filterValues[f.key];
        if (selected && selected !== "all") {
          if (String((row as Record<string, unknown>)[f.key]) !== selected) {
            return false;
          }
        }
      }
      if (!q) return true;
      const haystack = (
        searchKeys
          ? searchKeys.map((k) => row[k])
          : Object.values(row as Record<string, unknown>)
      )
        .filter((v) => typeof v === "string" || typeof v === "number")
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, filterValues, filters, searchKeys]);

  return (
    <div className="space-y-4">
      <SearchAndFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={(key, value) =>
          setFilterValues((prev) => ({ ...prev, [key]: value }))
        }
      />
      {filtered.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
                        col.className
                      )}
                    >
                      {col.header}
                    </th>
                  ))}
                  {showActions && <th scope="col" className="w-12 px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50/75">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("whitespace-nowrap px-4 py-3 text-slate-700", col.className)}
                      >
                        {col.render
                          ? col.render(row)
                          : String(
                              (row as Record<string, unknown>)[col.key] ?? "—"
                            )}
                      </td>
                    ))}
                    {showActions && (
                      <td className="px-4 py-2 text-right">
                        <ActionMenu />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            Showing {filtered.length} of {rows.length} records
          </div>
        </div>
      )}
    </div>
  );
}
