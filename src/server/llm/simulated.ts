import type { z } from "zod";
import {
  SIMULATED_BATTLECARD_FLAWED,
  SIMULATED_CAMPAIGN_PLAN,
  SIMULATED_CONTENT_MATRIX_FLAWED,
  SIMULATED_MESSAGING_FRAMEWORK,
  SIMULATED_PRODUCT_INTELLIGENCE_BRIEF,
  SIMULATED_REGULATORY_BRIEF,
  SIMULATED_SALES_PLAY_LOYALTY,
  SIMULATED_SALES_PLAY_OUTREACH,
  SIMULATED_SALES_PLAY_RETENTION,
} from "../../demo/fixtures";
import { kpiResultsFromPrompt, simulatedPerformanceReview } from "../../demo/performance";
import type { AssetType } from "../../domain/schemas/agents";
import { LlmOutputInvalidError } from "./errors";
import { ZERO_USAGE, type GenerateOptions, type LlmProvider, type LlmResult, type OutputSpec, type RenderedPrompt } from "./types";

export const SIMULATED_MODEL_ID = "simulated-fixtures-v1";

const SALES_PLAYS: Record<string, unknown> = {
  outreach_sequence: SIMULATED_SALES_PLAY_OUTREACH,
  retention_play: SIMULATED_SALES_PLAY_RETENTION,
  loyalty_play: SIMULATED_SALES_PLAY_LOYALTY,
};

/**
 * The play type agent F was asked for (campaignBriefNotes → <brief>). The
 * simulated provider replays the matching fixture; unknown → outreach.
 */
export function requestedPlayType(prompt: Pick<RenderedPrompt, "user">): string {
  const m = /^requested_play_type: (\w+)$/m.exec(prompt.user);
  return m && m[1]! in SALES_PLAYS ? m[1]! : "outreach_sequence";
}

const DEFAULT_FIXTURES: Record<AssetType, unknown | ((prompt: RenderedPrompt) => unknown)> = {
  product_intelligence_brief: SIMULATED_PRODUCT_INTELLIGENCE_BRIEF,
  messaging_framework: SIMULATED_MESSAGING_FRAMEWORK,
  // Demo storyline (DEMO_SCRIPT step 7): v1 deliberately fails the gates; the
  // corrected v2 is created as a human edit ("Load prepared correction").
  competitive_battlecard: SIMULATED_BATTLECARD_FLAWED,
  regulatory_gtm_brief: SIMULATED_REGULATORY_BRIEF,
  campaign_plan: SIMULATED_CAMPAIGN_PLAN,
  // Campaign storyline: content matrix v1 contains an unsupported compliance promise → blocked.
  content_matrix: SIMULATED_CONTENT_MATRIX_FLAWED,
  sales_play: (prompt: RenderedPrompt) => SALES_PLAYS[requestedPlayType(prompt)],
  // M11: template-based review from the KPI results in the prompt (quotes only those numbers).
  performance_review: (prompt: RenderedPrompt) => simulatedPerformanceReview(kpiResultsFromPrompt(prompt.user)),
};

/**
 * Deterministic, offline provider: returns the synthetic fixtures from
 * src/demo/fixtures.ts through the same validation path as live output.
 * Never sends data anywhere, so the classification gate does not apply.
 */
export class SimulatedProvider implements LlmProvider {
  readonly mode = "simulated" as const;
  readonly external = false;
  readonly modelId = SIMULATED_MODEL_ID;
  readonly maxTokens = 0;

  constructor(private readonly fixtures: Partial<Record<AssetType, unknown>> = {}) {}

  async generate<S extends z.ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, _opts: GenerateOptions): Promise<LlmResult<z.infer<S>>> {
    const fallback = DEFAULT_FIXTURES[spec.assetType];
    const fixture = structuredClone(this.fixtures[spec.assetType] ?? (typeof fallback === "function" ? fallback(prompt) : fallback));
    const parsed = spec.schema.safeParse(fixture);
    if (!parsed.success) {
      throw new LlmOutputInvalidError(
        `Simulated fixture for ${spec.assetType} does not match its schema.`,
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    return {
      data: parsed.data,
      usage: { ...ZERO_USAGE },
      modelId: SIMULATED_MODEL_ID,
      mode: "simulated",
      costEstimateUsd: 0,
      prompt: { id: prompt.id, version: prompt.version },
      attempts: 0,
    };
  }
}
