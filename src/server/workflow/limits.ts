import { WORKFLOW_LIMITS, type WorkflowStatus } from "../../domain/workflow/workflow-state";
import { hasPricing, maxRequestCostUsd } from "../llm/pricing";
import { MAX_REQUESTS_PER_GENERATE, type LlmProvider } from "../llm/types";
import { WorkflowLimitError } from "./errors";

type Env = Record<string, string | undefined>;

/** LLM_MAX_COST_USD_PER_RUN, but never above WORKFLOW_LIMITS.maxCostUsdPerRun. */
export function costCapUsd(env: Env = process.env): number {
  const v = Number(env.LLM_MAX_COST_USD_PER_RUN);
  return Number.isFinite(v) && v > 0 ? Math.min(v, WORKFLOW_LIMITS.maxCostUsdPerRun) : WORKFLOW_LIMITS.maxCostUsdPerRun;
}

/**
 * Per-run cost cap, enforced BEFORE each model call: a step only starts if the
 * spend so far plus that step's worst case (full max_tokens output, input
 * over-estimated, one re-prompt) stays within the cap. A live model without a
 * documented price fails closed, because the cap could not be enforced.
 */
export class CostBudget {
  private spent = 0;

  constructor(
    readonly capUsd: number,
    private readonly provider: Pick<LlmProvider, "mode" | "modelId" | "maxTokens">,
  ) {
    if (provider.mode === "live" && !hasPricing(provider.modelId)) {
      throw new WorkflowLimitError(
        "cost_unenforceable",
        `No documented price for model "${provider.modelId}"; the per-run cost cap cannot be enforced.`,
      );
    }
  }

  get spentUsd(): number {
    return this.spent;
  }

  worstCaseUsd(promptChars: number): number {
    if (this.provider.mode === "simulated") return 0;
    const perRequest = maxRequestCostUsd(this.provider.modelId, promptChars, this.provider.maxTokens) ?? Infinity;
    return perRequest * MAX_REQUESTS_PER_GENERATE;
  }

  /** Throws (before the call) if the next step could push the run over the cap. */
  reserve(promptChars: number): void {
    const worst = this.worstCaseUsd(promptChars);
    if (this.spent + worst > this.capUsd) {
      throw new WorkflowLimitError(
        "cost_cap",
        `Next step could exceed the per-run cost cap ($${this.capUsd.toFixed(2)}; spent $${this.spent.toFixed(4)}).`,
      );
    }
  }

  record(costUsd: number | null): void {
    if (costUsd === null && this.provider.mode === "live") {
      throw new WorkflowLimitError("cost_unenforceable", "A live call returned no cost estimate.");
    }
    this.spent += costUsd ?? 0;
  }
}

export function assertConcurrencyAvailable(activeRuns: number, limit: number = WORKFLOW_LIMITS.maxConcurrentRunsPerTenant): void {
  if (activeRuns >= limit) {
    throw new WorkflowLimitError("concurrency_limit", `At most ${limit} workflow runs may be active per tenant.`);
  }
}

/** Retry is explicit and only for failed runs with attempts left. */
export function assertCanRetry(run: { status: WorkflowStatus; attempts: number }, max: number = WORKFLOW_LIMITS.maxAttempts): void {
  if (run.status !== "failed") {
    throw new WorkflowLimitError("max_attempts", `Only failed runs can be retried (run is ${run.status}).`);
  }
  if (run.attempts >= max) {
    throw new WorkflowLimitError("max_attempts", `Run has used all ${max} attempts.`);
  }
}
