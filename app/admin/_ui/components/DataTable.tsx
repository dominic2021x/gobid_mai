"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onSort?: (key: string) => void;
  sortKey?: string | null;
  sortDir?: "asc" | "desc";
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onSort,
  sortKey,
  sortDir = "asc",
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-slate-200 bg-white", className)}>
      <table className="min-w-full divide-y divide-slate-200" role="grid">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600",
                  col.sortable && "cursor-pointer select-none hover:text-slate-900",
                  sortKey === col.key && "text-slate-900"
                )}
                onClick={col.sortable ? () => onSort?.(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span aria-hidden className="text-slate-400">
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              className="transition-colors hover:bg-slate-50/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-5 py-3 text-sm text-slate-700"
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
