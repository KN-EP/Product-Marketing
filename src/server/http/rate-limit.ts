import { HttpError } from "../errors";

/**
 * Sliding-window limits per key. In-memory, i.e. per server process — enough
 * for the single-instance P0 deployment; a multi-instance deployment needs a
 * shared store (e.g. Redis/Postgres) behind the same interface.
 */
export const RATE_LIMITS = {
  /** per client IP + e-mail */
  login: { limit: 10, windowMs: 5 * 60_000 },
  /** per tenant + user (POST /api/workflows and startWorkflowAction) */
  workflowStart: { limit: 10, windowMs: 60_000 },
  /** per tenant + user */
  decision: { limit: 30, windowMs: 60_000 },
  /** per tenant + user (createCampaignAction) */
  campaignCreate: { limit: 20, windowMs: 60_000 },
  /** per tenant + user (KPI tree, KPI edits, CSV imports) */
  kpiWrite: { limit: 60, windowMs: 60_000 },
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

const MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Records an attempt and says whether it is allowed. */
  check(key: string, rule: { limit: number; windowMs: number }): { ok: true } | { ok: false; retryAfterMs: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => t - ts < rule.windowMs);
    if (recent.length >= rule.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: rule.windowMs - (t - recent[0]!) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > MAX_KEYS) this.prune(t, rule.windowMs);
    return { ok: true };
  }

  private prune(t: number, windowMs: number) {
    for (const [k, v] of this.hits) if (v.every((ts) => t - ts >= windowMs)) this.hits.delete(k);
  }

  reset() {
    this.hits.clear();
  }
}

const g = globalThis as unknown as { __pmmRateLimiter?: RateLimiter };
const limiter = (g.__pmmRateLimiter ??= new RateLimiter());

/** Throws HttpError 429 "rate_limited" when the caller exceeded the limit. */
export function enforceRateLimit(kind: RateLimitKind, key: string): void {
  const r = limiter.check(`${kind}:${key}`, RATE_LIMITS[kind]);
  if (!r.ok) {
    throw new HttpError(429, "rate_limited", `Too many requests. Try again in ${Math.ceil(r.retryAfterMs / 1000)} s.`);
  }
}

/** Tests only. */
export function resetRateLimits(): void {
  limiter.reset();
}
