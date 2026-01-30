'use client';

import { useState } from 'react';
import { cn, truncateUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface BrowserPreviewProps {
  screenshot: string | null;
  html: string | null;
  currentUrl: string | null;
  currentTitle: string | null;
  isExecuting?: boolean;
  connected?: boolean;
}

type Tab = 'screenshot' | 'html';

export function BrowserPreview({
  screenshot,
  html,
  currentUrl,
  currentTitle,
  isExecuting,
  connected,
}: BrowserPreviewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('screenshot');
  const [zoomLevel, setZoomLevel] = useState(100);

  return (
    <div className="flex flex-col h-full bg-[var(--card)] rounded-xl border border-[var(--card-border)] overflow-hidden">
      {/* Browser Chrome */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]">
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--card)] text-xs">
          {connected ? (
            <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-[var(--error)]" />
          )}
          <span className="text-[var(--muted)] truncate">
            {currentUrl ? truncateUrl(currentUrl, 60) : 'No page loaded'}
          </span>
        </div>

        {/* Connection status */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium',
            connected
              ? 'bg-[var(--success)]/10 text-[var(--success)]'
              : 'bg-[var(--error)]/10 text-[var(--error)]'
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-[var(--success)]' : 'bg-[var(--error)]',
              connected && 'animate-pulse'
            )}
          />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--card-border)]">
        <button
          onClick={() => setActiveTab('screenshot')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'screenshot'
              ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Screenshot
        </button>
        <button
          onClick={() => setActiveTab('html')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'html'
              ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          HTML
        </button>

        <div className="flex-1" />

        {/* Zoom controls */}
        {activeTab === 'screenshot' && screenshot && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </Button>
            <span className="text-[10px] text-[var(--muted)] w-8 text-center">{zoomLevel}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto relative">
        {isExecuting && (
          <div className="absolute inset-0 bg-[var(--background)]/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-[var(--muted)]">Executing action...</span>
            </div>
          </div>
        )}

        {activeTab === 'screenshot' ? (
          screenshot ? (
            <div className="p-4 flex items-center justify-center min-h-full">
              <img
                src={screenshot}
                alt="Browser screenshot"
                className="rounded-lg shadow-lg border border-[var(--card-border)]"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: `${zoomLevel}%`,
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--card-border)] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
                No Screenshot Yet
              </h3>
              <p className="text-xs text-[var(--muted)] max-w-xs">
                {connected
                  ? 'Click the Screenshot button or ask the AI to take a screenshot'
                  : 'Connect the browser extension to capture screenshots'}
              </p>
            </div>
          )
        ) : (
          html ? (
            <pre className="p-4 text-xs font-mono text-[var(--muted)] whitespace-pre-wrap break-words">
              {html.slice(0, 10000)}
              {html.length > 10000 && (
                <span className="text-[var(--warning)]">
                  {'\n\n'}... truncated ({html.length - 10000} more characters)
                </span>
              )}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--card-border)] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
                No HTML Content
              </h3>
              <p className="text-xs text-[var(--muted)] max-w-xs">
                {connected
                  ? 'Click the Extract HTML button or ask the AI to extract page content'
                  : 'Connect the browser extension to extract HTML'}
              </p>
            </div>
          )
        )}
      </div>

      {/* Page info footer */}
      {currentTitle && (
        <div className="px-3 py-2 border-t border-[var(--card-border)] bg-[var(--background)]">
          <p className="text-[10px] text-[var(--muted)] truncate">
            <span className="text-[var(--foreground)]">{currentTitle}</span>
          </p>
        </div>
      )}
    </div>
  );
}
