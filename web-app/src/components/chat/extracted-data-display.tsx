'use client';

import { useState, useMemo } from 'react';
import { parseExtractedData } from '@/lib/data-parser';
import { downloadAsCSV, downloadAsJSON } from '@/lib/download-utils';
import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';

interface ValidationIssue {
  type: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationInfo {
  isValid: boolean;
  issues: ValidationIssue[];
}

interface ExtractedDataDisplayProps {
  data: unknown;
  toolName: string;
  validation?: ValidationInfo;
}

function DownloadButton({
  onClick,
  icon,
  label,
  variant = 'default',
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'primary';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 focus:ring-offset-1 focus:ring-offset-[var(--background)]',
        variant === 'default' && [
          'bg-[var(--card-border)]/50 text-[var(--muted)] border border-[var(--card-border)]',
          'hover:bg-[var(--card-border)] hover:text-[var(--foreground)] hover:border-[var(--muted)]/50',
          'hover:shadow-lg hover:shadow-black/10',
        ],
        variant === 'primary' && [
          'bg-gradient-to-r from-[var(--accent)]/20 to-[var(--accent-secondary)]/20',
          'text-[var(--accent)] border border-[var(--accent)]/30',
          'hover:from-[var(--accent)]/30 hover:to-[var(--accent-secondary)]/30',
          'hover:border-[var(--accent)]/50 hover:shadow-lg hover:shadow-[var(--accent)]/10',
        ]
      )}
    >
      <span className="transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5">
        {icon}
      </span>
      <span>{label}</span>
      <span className={cn(
        'absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200',
        'bg-gradient-to-r from-[var(--accent)]/5 to-[var(--accent-secondary)]/5',
        'group-hover:opacity-100'
      )} />
    </button>
  );
}

function RowCountBadge({ count }: { count: number }) {
  return (
    <div className="relative inline-flex items-center">
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full',
        'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-secondary)]/15',
        'text-[var(--accent)] border border-[var(--accent)]/20',
        'shadow-inner shadow-[var(--accent)]/5'
      )}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-40" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
        </span>
        {count} {count === 1 ? 'row' : 'rows'}
      </span>
    </div>
  );
}

function ValidationWarnings({ issues }: { issues: ValidationIssue[] }) {
  if (!issues || issues.length === 0) return null;

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--background)]/50">
      {errors.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {errors.map((issue, i) => (
            <div
              key={`error-${i}`}
              className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-lg text-sm',
                'bg-red-500/10 border border-red-500/20 text-red-400'
              )}
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((issue, i) => (
            <div
              key={`warning-${i}`}
              className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-lg text-sm',
                'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
              )}
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ValidationStatusBadge({ validation }: { validation: ValidationInfo }) {
  if (validation.isValid && validation.issues.length === 0) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full',
        'bg-green-500/15 text-green-400 border border-green-500/20'
      )}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Validated
      </span>
    );
  }

  const hasErrors = validation.issues.some(i => i.severity === 'error');
  if (hasErrors) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full',
        'bg-red-500/15 text-red-400 border border-red-500/20'
      )}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        {validation.issues.filter(i => i.severity === 'error').length} Error{validation.issues.filter(i => i.severity === 'error').length > 1 ? 's' : ''}
      </span>
    );
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full',
      'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
    )}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
      </svg>
      {validation.issues.length} Warning{validation.issues.length > 1 ? 's' : ''}
    </span>
  );
}

export function ExtractedDataDisplay({ data, toolName, validation }: ExtractedDataDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const parsedData = useMemo(() => parseExtractedData(data), [data]);

  const handleDownloadCSV = () => {
    if (parsedData.type === 'table' && parsedData.headers && parsedData.rows) {
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadAsCSV(parsedData.headers, parsedData.rows, `${toolName}-${timestamp}`);
    }
  };

  const handleDownloadJSON = () => {
    if (parsedData.type === 'table' && parsedData.headers && parsedData.rows) {
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadAsJSON(parsedData.headers, parsedData.rows, `${toolName}-${timestamp}`);
    }
  };

  // Table view for structured data
  if (parsedData.type === 'table' && parsedData.headers && parsedData.rows) {
    const rowCount = parsedData.rows.length;

    return (
      <div className={cn(
        'relative mt-3 rounded-xl overflow-hidden',
        'bg-gradient-to-b from-[var(--card)] to-[var(--card)]/80',
        'border border-[var(--card-border)]',
        'shadow-xl shadow-black/20',
        'animate-data-card-in'
      )}>
        {/* Decorative top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />

        {/* Header */}
        <div className={cn(
          'relative flex items-center justify-between px-4 py-3',
          'bg-gradient-to-r from-[var(--background)]/80 via-[var(--background)]/60 to-[var(--background)]/80',
          'border-b border-[var(--card-border)]',
          'backdrop-blur-sm'
        )}>
          {/* Left side - Title and row count */}
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex items-center justify-center w-9 h-9 rounded-lg',
              'bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20',
              'border border-[var(--accent)]/20',
              'shadow-lg shadow-[var(--accent)]/10'
            )}>
              <svg className="w-4.5 h-4.5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-[var(--foreground)]">Extracted Data</span>
              <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Structured Table</span>
            </div>
            <RowCountBadge count={rowCount} />
            {validation && <ValidationStatusBadge validation={validation} />}
          </div>

          {/* Right side - Download buttons */}
          <div className="flex items-center gap-2">
            <DownloadButton
              onClick={handleDownloadCSV}
              variant="default"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              label="CSV"
            />
            <DownloadButton
              onClick={handleDownloadJSON}
              variant="primary"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
              label="JSON"
            />
          </div>
        </div>

        {/* Validation warnings */}
        {validation && validation.issues && validation.issues.length > 0 && (
          <ValidationWarnings issues={validation.issues} />
        )}

        {/* Table content */}
        <DataTable
          headers={parsedData.headers}
          rows={parsedData.rows}
          maxHeight={320}
        />

        {/* Footer gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--card)] to-transparent pointer-events-none" />
      </div>
    );
  }

  // Text fallback for unstructured data
  if (parsedData.type === 'text' && parsedData.text) {
    const textContent = parsedData.text;
    const isLong = textContent.length > 500;
    const displayText = isLong && !isExpanded ? textContent.slice(0, 500) + '...' : textContent;

    return (
      <div className={cn(
        'relative mt-3 rounded-xl overflow-hidden',
        'bg-gradient-to-b from-[var(--card)] to-[var(--card)]/80',
        'border border-[var(--card-border)]',
        'shadow-xl shadow-black/20',
        'animate-data-card-in'
      )}>
        {/* Decorative top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--muted)]/30 to-transparent" />

        {/* Header */}
        <div className={cn(
          'relative flex items-center gap-3 px-4 py-3',
          'bg-gradient-to-r from-[var(--background)]/80 via-[var(--background)]/60 to-[var(--background)]/80',
          'border-b border-[var(--card-border)]',
          'backdrop-blur-sm'
        )}>
          <div className={cn(
            'flex items-center justify-center w-9 h-9 rounded-lg',
            'bg-[var(--card-border)]/50',
            'border border-[var(--card-border)]'
          )}>
            <svg className="w-4.5 h-4.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm text-[var(--foreground)]">Extracted Content</span>
            <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Raw Text</span>
          </div>
        </div>

        {/* Text content */}
        <div className="px-4 py-4">
          <pre
            className={cn(
              'text-sm text-[var(--foreground)]/85 whitespace-pre-wrap font-mono',
              'max-h-[300px] overflow-auto leading-relaxed',
              'selection:bg-[var(--accent)]/30'
            )}
          >
            {displayText}
          </pre>

          {isLong && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
                'bg-[var(--card-border)]/50 text-[var(--muted)]',
                'border border-[var(--card-border)]',
                'hover:bg-[var(--card-border)] hover:text-[var(--foreground)]',
                'transition-all duration-200'
              )}
            >
              <svg
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
