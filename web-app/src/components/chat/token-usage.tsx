'use client';

import { TokenUsage, calculateCost } from '@/lib/token-cost';

export function TokenUsageDisplay({ usage }: { usage: TokenUsage | null }) {
  if (!usage) return null;
  const cost = calculateCost(usage);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--muted)] border-t border-[var(--card-border)]">
      <span>📊</span>
      <span>
        {usage.inputTokens.toLocaleString()} in + {usage.outputTokens.toLocaleString()} out
      </span>
      <span className="text-[var(--accent)]">({cost.formatted})</span>
    </div>
  );
}
