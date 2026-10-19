import type { LlmUsage } from "./types";

/**
 * USD per million tokens, Anthropic first-party API list prices as documented
 * on 2026-10-06. ESTIMATES ONLY — the invoice is authoritative. Only models
 * whose input, output and cache-read prices are all documented are listed;
 * any other model gets costEstimateUsd = null instead of a guess.
 * Cache writes are estimated at 1.25× the input price (5-minute TTL).
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};

export function hasPricing(modelId: string): boolean {
  return modelId in PRICES;
}

/**
 * Conservative upper bound for ONE request: input estimated at 1 token per 3
 * characters (over-counts for typical text) and the full max_tokens of output.
 * Null when the model has no documented price.
 */
export function maxRequestCostUsd(modelId: string, promptChars: number, maxTokens: number): number | null {
  const p = PRICES[modelId];
  if (!p) return null;
  return (Math.ceil(promptChars / 3) * p.input + maxTokens * p.output) / 1_000_000;
}

export function estimateCostUsd(modelId: string, u: LlmUsage): number | null {
  const p = PRICES[modelId];
  if (!p) return null;
  const usd =
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadInputTokens * p.cacheRead +
      u.cacheCreationInputTokens * p.input * 1.25) /
    1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}
