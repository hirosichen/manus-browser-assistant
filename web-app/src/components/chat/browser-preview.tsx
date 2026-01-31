'use client';

import { useState, useDeferredValue, useMemo, useEffect } from 'react';
import { cn, truncateUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface BrowserPreviewProps {
  html: string | null;
  currentUrl: string | null;
  currentTitle: string | null;
  isExecuting?: boolean;
  connected?: boolean;
  livePreviewEnabled?: boolean;
  liveScreenshot?: string | null;
  onStartLivePreview?: () => Promise<{ success: boolean; error?: string }>;
  onStopLivePreview?: () => Promise<{ success: boolean; error?: string }>;
}

type Tab = 'live' | 'html';

export function BrowserPreview({
  html,
  currentUrl,
  currentTitle,
  isExecuting,
  connected,
  livePreviewEnabled,
  liveScreenshot,
  onStartLivePreview,
  onStopLivePreview,
}: BrowserPreviewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showFullHtml, setShowFullHtml] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);

  const HTML_PREVIEW_LIMIT = 10000;

  // Switch to live tab when live preview is enabled
  useEffect(() => {
    if (livePreviewEnabled) {
      setActiveTab('live');
    }
  }, [livePreviewEnabled]);

  const handleStartLive = async () => {
    if (onStartLivePreview) {
      setIsStartingLive(true);
      try {
        await onStartLivePreview();
      } finally {
        setIsStartingLive(false);
      }
    }
  };

  const handleStopLive = async () => {
    if (onStopLivePreview) {
      await onStopLivePreview();
      setActiveTab('html');
    }
  };

  // Use deferred value to prevent blocking UI when showing full HTML
  const deferredShowFullHtml = useDeferredValue(showFullHtml);

  // Memoize the HTML content to prevent re-computation
  const displayedHtml = useMemo(() => {
    if (!html) return '';
    if (deferredShowFullHtml) return html;
    return html.slice(0, HTML_PREVIEW_LIMIT);
  }, [html, deferredShowFullHtml]);

  const isLoadingFullHtml = showFullHtml !== deferredShowFullHtml;

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
        {/* Live Preview button - first */}
        {connected && (
          livePreviewEnabled ? (
            <button
              onClick={handleStopLive}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                'bg-red-500/10 text-red-500 hover:bg-red-500/20'
              )}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Stop Live
            </button>
          ) : (
            <button
              onClick={handleStartLive}
              disabled={isStartingLive}
              aria-label={isStartingLive ? 'Starting live preview' : 'Start live preview'}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === 'live'
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]',
                isStartingLive && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isStartingLive ? (
                <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              Live
            </button>
          )
        )}
        <button
          onClick={() => setActiveTab('html')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'html'
              ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]'
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          HTML
        </button>

        <div className="flex-1" />

        {/* Zoom controls for live view */}
        {activeTab === 'live' && liveScreenshot && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
              aria-label="Zoom out"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </Button>
            <span className="text-[10px] text-[var(--muted)] w-8 text-center">{zoomLevel}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
              aria-label="Zoom in"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

        {activeTab === 'live' ? (
          livePreviewEnabled && liveScreenshot ? (
            <div className="p-4 flex items-center justify-center min-h-full bg-black relative">
              {/* Live indicator */}
              <div className="absolute top-6 left-6 flex items-center gap-2 px-2 py-1 rounded bg-red-500/90 text-white text-xs font-medium z-10">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                LIVE
              </div>
              <img
                src={liveScreenshot}
                alt="Live preview of current browser tab"
                width={1920}
                height={1080}
                className="rounded-lg shadow-lg border border-[var(--card-border)]"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: `${zoomLevel}%`,
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : livePreviewEnabled ? (
            <div className="p-4 flex items-center justify-center min-h-full bg-black">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-sm text-[var(--muted)] mb-2">正在連接串流...</p>
                  <p className="text-xs text-[var(--muted)]/70 max-w-xs">
                    即時預覽即將開始
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--card-border)] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
                Live Preview
              </h3>
              <p className="text-xs text-[var(--muted)] max-w-xs">
                {connected
                  ? 'Click the Live button to start real-time preview of the target tab'
                  : 'Connect the browser extension to enable live preview'}
              </p>
            </div>
          )
        ) : activeTab === 'html' ? (
          html ? (
            <div className="relative h-full overflow-hidden">
              {isLoadingFullHtml && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-2 py-1 bg-[var(--card)] rounded text-xs text-[var(--muted)]">
                  <div className="w-3 h-3 border border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  Loading...
                </div>
              )}
              <pre
                className="p-4 text-xs font-mono text-[var(--muted)] whitespace-pre-wrap break-all h-full overflow-auto"
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: '0 500px',
                  maxWidth: '100%',
                  wordBreak: 'break-all',
                }}
              >
                {displayedHtml}
                {!showFullHtml && html.length > HTML_PREVIEW_LIMIT && (
                  <span
                    className="text-[var(--warning)] cursor-pointer hover:underline"
                    onClick={() => setShowFullHtml(true)}
                  >
                    {'\n\n'}... truncated ({(html.length - HTML_PREVIEW_LIMIT).toLocaleString()} more characters) - Click to show all
                  </span>
                )}
                {deferredShowFullHtml && html.length > HTML_PREVIEW_LIMIT && (
                  <span
                    className="text-[var(--accent)] cursor-pointer hover:underline"
                    onClick={() => setShowFullHtml(false)}
                  >
                    {'\n\n'}[Collapse]
                  </span>
                )}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--card-border)] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
        ) : null}
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
