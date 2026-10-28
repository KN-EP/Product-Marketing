import { z } from "zod";
import {
  AGENT_A_PROMPT,
  AGENT_B_PROMPT,
  AGENT_C_BATTLECARD_PROMPT,
  AGENT_C_REGULATORY_PROMPT,
  AGENT_D_CAMPAIGN_PLAN_PROMPT,
  AGENT_E_CONTENT_MATRIX_PROMPT,
  AGENT_F_SALES_PLAY_PROMPT,
  AGENT_G_PERFORMANCE_PROMPT,
} from "../prompts";

export const PMM_THREE_ASSET = "pmm_three_asset";
/** M8–M10: campaign package (campaign plan, content matrix, sales play) for one Campaign. */
export const CAMPAIGN_GTM = "campaign_gtm";
/** M11: performance review of a campaign from its imported KPI measurements. */
export const CAMPAIGN_PERFORMANCE = "campaign_performance";
export type RunKind = typeof PMM_THREE_ASSET | typeof CAMPAIGN_GTM | typeof CAMPAIGN_PERFORMANCE;

const Id = z.string().trim().min(1).max(64);
/** Optional: a new nonce deliberately starts a new run with the same inputs. */
const Nonce = z.string().trim().min(1).max(64).optional();

/**
 * Start input of the pmm_three_asset run. Strict: unknown keys (e.g. a tenantId)
 * are rejected, never silently used. Ids are resolved via tenantDb (404 on miss).
 * `kind` may be omitted (the original run kind).
 */
export const StartPmmInput = z.strictObject({
  kind: z.literal(PMM_THREE_ASSET).default(PMM_THREE_ASSET),
  productId: Id,
  personaId: Id,
  market: z.string().trim().min(2).max(120),
  regulatoryTriggerId: Id,
  competitorIds: z
    .array(Id)
    .length(3)
    .refine((ids) => new Set(ids).size === ids.length, "competitorIds must be distinct"),
  requestNonce: Nonce,
});

/** Start input of the campaign_gtm run: everything else comes from the (tenant-scoped) Campaign record. */
export const StartCampaignInput = z.strictObject({
  kind: z.literal(CAMPAIGN_GTM),
  campaignId: Id,
  requestNonce: Nonce,
});

/** Start input of the campaign_performance run (needs a KPI tree with at least one measurement). */
export const StartPerformanceInput = z.strictObject({
  kind: z.literal(CAMPAIGN_PERFORMANCE),
  campaignId: Id,
  requestNonce: Nonce,
});

export const StartWorkflowInput = z.union([StartPmmInput, StartCampaignInput, StartPerformanceInput]);
export type StartWorkflowInput = z.infer<typeof StartWorkflowInput>;

/** Stored as WorkflowRun.inputRefs: ids and the market label only. */
export type RunInputRefs = Omit<z.infer<typeof StartPmmInput>, "kind" | "requestNonce">;
export type CampaignRunInputRefs = Omit<z.infer<typeof StartCampaignInput>, "kind" | "requestNonce">;

const versions = (...ts: { id: string; version: string }[]) => Object.fromEntries(ts.map((t) => [t.id, t.version]));

/** Prompt template id → version for the pmm_three_asset run (part of the idempotency key). */
export const PROMPT_VERSIONS: Record<string, string> = versions(AGENT_A_PROMPT, AGENT_B_PROMPT, AGENT_C_BATTLECARD_PROMPT, AGENT_C_REGULATORY_PROMPT);

/** Prompt template id → version for the campaign_gtm run (part of the idempotency key). */
export const CAMPAIGN_PROMPT_VERSIONS: Record<string, string> = versions(
  AGENT_D_CAMPAIGN_PLAN_PROMPT,
  AGENT_E_CONTENT_MATRIX_PROMPT,
  AGENT_F_SALES_PLAY_PROMPT,
);

/** Prompt template id → version for the campaign_performance run. */
export const PERFORMANCE_PROMPT_VERSIONS: Record<string, string> = versions(AGENT_G_PERFORMANCE_PROMPT);
