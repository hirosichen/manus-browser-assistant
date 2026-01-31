'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DataTableProps {
  headers: string[];
  rows: string[][];
  maxHeight?: number;
  className?: string;
}

interface TooltipState {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

export function DataTable({ headers, rows, maxHeight = 300, className }: DataTableProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    content: '',
    x: 0,
    y: 0,
  });
  const tableRef = useRef<HTMLDivElement>(null);

  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLTableCellElement>,
    content: string
  ) => {
    const cell = e.currentTarget;
    // Only show tooltip if content is truncated
    if (cell.scrollWidth > cell.clientWidth && content.length > 0) {
      const rect = cell.getBoundingClientRect();
      const tableRect = tableRef.current?.getBoundingClientRect();
      if (tableRect) {
        setTooltip({
          visible: true,
          content,
          x: rect.left - tableRect.left + rect.width / 2,
          y: rect.top - tableRect.top - 8,
        });
      }
    }
  };

  const handleCellMouseLeave = () => {
    setTooltip({ ...tooltip, visible: false });
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-[var(--card-border)] to-[var(--card)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-[var(--muted)] text-sm font-medium">No data available</p>
        <p className="text-[var(--muted)]/60 text-xs mt-1">Extract some content to see it here</p>
      </div>
    );
  }

  return (
    <div
      ref={tableRef}
      className={cn('relative overflow-auto data-table-scroll', className)}
      style={{ maxHeight }}
    >
      {/* Custom Tooltip */}
      {tooltip.visible && (
        <div
          className="absolute z-50 px-3 py-2 text-xs font-medium text-[var(--foreground)] bg-[var(--card)] border border-[var(--card-border)] rounded-lg shadow-xl shadow-black/20 max-w-[300px] break-words pointer-events-none transform -translate-x-1/2 -translate-y-full animate-tooltip-in"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--card-border)]" />
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider',
                  'text-[var(--accent)] bg-[var(--background)]',
                  'border-b-2 border-[var(--accent)]/20',
                  'whitespace-nowrap',
                  'first:pl-4 last:pr-4'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="relative">
                    {header}
                    <span className="absolute -bottom-1 left-0 w-full h-px bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--card-border)]/30">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                'group transition-[background-color] duration-200',
                rowIndex % 2 === 0
                  ? 'bg-transparent'
                  : 'bg-[var(--card-border)]/10',
                'hover:bg-[var(--accent)]/[0.08]',
                'animate-row-in'
              )}
              style={{ animationDelay: `${Math.min(rowIndex * 30, 300)}ms` }}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  onMouseEnter={(e) => handleCellMouseEnter(e, cell)}
                  onMouseLeave={handleCellMouseLeave}
                  className={cn(
                    'px-4 py-3 text-[var(--foreground)]/85',
                    'max-w-[280px] truncate',
                    'transition-colors duration-150',
                    'group-hover:text-[var(--foreground)]',
                    'first:pl-4 last:pr-4',
                    'cursor-default'
                  )}
                >
                  {cell ? (
                    <span className="relative">
                      {cell}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[var(--muted)]/40 italic text-xs">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                      empty
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
