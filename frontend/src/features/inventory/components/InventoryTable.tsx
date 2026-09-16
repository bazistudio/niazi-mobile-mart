'use client';

import React from 'react';

export interface TableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

export interface InventoryTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
}

/** Skeleton row placeholder */
const SkeletonRow = ({ cols }: { cols: number }) => (
  <tr className="border-b border-border animate-pulse">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-3 py-2.5">
        <div className="h-3 bg-surface-hover rounded-full w-3/4" />
      </td>
    ))}
  </tr>
);

export function InventoryTable<T extends { id?: string }>({
  columns,
  data,
  onRowClick,
  isLoading = false,
}: InventoryTableProps<T>) {
  return (
    <div className="w-full h-full overflow-auto bg-surface custom-scrollbar">
      <table className="w-full border-collapse text-sm text-left whitespace-nowrap">

        {/* Header */}
        <thead className="sticky top-0 z-10 bg-surface-hover shadow-xs border-b border-border">
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider border-r border-border last:border-r-0 ${
                  index === 0 ? 'border-l-0' : ''
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={`sk-${i}`} cols={columns.length} />
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-12 text-center text-text-muted border-b border-border"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm">No records found.</span>
                  <span className="text-xs text-text-muted/60">Try adjusting filters or adding new items.</span>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(e) => e.key === 'Enter' && onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                className={`border-b border-border transition-colors group ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-primary/5 focus-visible:outline-none focus-visible:bg-primary/5'
                    : 'hover:bg-surface-hover'
                }`}
              >
                {columns.map((col, colIndex) => (
                  <td
                    key={`${row.id || rowIndex}-${col.key}`}
                    className={`px-3 py-1.5 text-text-primary border-r border-border last:border-r-0 ${
                      colIndex === 0 ? 'border-l-0' : ''
                    }`}
                  >
                    {col.render ? col.render(row) : (row as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>

      </table>
    </div>
  );
}
