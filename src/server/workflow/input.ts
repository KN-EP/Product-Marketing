import { z } from "zod";
import {
  AGENT_A_PROMPT,
  AGENT_B_PROMPT,
  AGENT_C_BATTLECARD_PROMPT,
  AGENT_C_REGULATORY_PROMPT,
} from "../prompts";

export const PMM_THREE_ASSET = "pmm_three_asset";

const Id = z.string().trim().min(1).max(64);

/**
 * Start input for the only run kind. Strict: unknown keys (e.g. a tenantId)
 * are rejected, never silently used. Ids are resolved via tenantDb (404 on miss).
 */
export const StartWorkflowInput = z.strictObject({
  kind: z.literal(PMM_THREE_ASSET).default(PMM_THREE_ASSET),
  productId: Id,
  personaId: Id,
  market: z.string().trim().min(2).max(120),
  regulatoryTriggerId: Id,
  competitorIds: z
    .array(Id)
    .length(3)
    .refine((ids) => new Set(ids).size === ids.length, "competitorIds must be distinct"),
  /** Optional: a new nonce deliberately starts a new run with the same inputs. */
  requestNonce: z.string().trim().min(1).max(64).optional(),
});
export type StartWorkflowInput = z.infer<typeof StartWorkflowInput>;

/** Stored as WorkflowRun.inputRefs: ids and the market label only. */
export type RunInputRefs = Omit<StartWorkflowInput, "kind" | "requestNonce">;

/** Prompt template id → version for this run kind (part of the idempotency key). */
export const PROMPT_VERSIONS: Record<string, string> = Object.fromEntries(
  [AGENT_A_PROMPT, AGENT_B_PROMPT, AGENT_C_BATTLECARD_PROMPT, AGENT_C_REGULATORY_PROMPT].map((t) => [t.id, t.version]),
);
