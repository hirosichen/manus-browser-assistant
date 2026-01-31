const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function calculateCost(usage: TokenUsage, model = 'claude-sonnet-4-20250514') {
  const pricing = PRICING[model] ?? PRICING['claude-sonnet-4-20250514'];
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    formatted: `$${(inputCost + outputCost).toFixed(4)}`,
  };
}
