import type { z } from "zod";
import {
  SIMULATED_BATTLECARD_CORRECTED,
  SIMULATED_MESSAGING_FRAMEWORK,
  SIMULATED_PRODUCT_INTELLIGENCE_BRIEF,
  SIMULATED_REGULATORY_BRIEF,
} from "../../demo/fixtures";
import type { AssetType } from "../../domain/schemas/agents";
import { LlmOutputInvalidError } from "./errors";
import { ZERO_USAGE, type GenerateOptions, type LlmProvider, type LlmResult, type OutputSpec, type RenderedPrompt } from "./types";

export const SIMULATED_MODEL_ID = "simulated-fixtures-v1";

const DEFAULT_FIXTURES: Record<AssetType, unknown> = {
  product_intelligence_brief: SIMULATED_PRODUCT_INTELLIGENCE_BRIEF,
  messaging_framework: SIMULATED_MESSAGING_FRAMEWORK,
  competitive_battlecard: SIMULATED_BATTLECARD_CORRECTED,
  regulatory_gtm_brief: SIMULATED_REGULATORY_BRIEF,
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
    const fixture = structuredClone(this.fixtures[spec.assetType] ?? DEFAULT_FIXTURES[spec.assetType]);
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
