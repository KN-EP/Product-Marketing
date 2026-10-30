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
  AGENT_RELEASE_PROMPT,
  AGENT_STRATEGY_PROMPT,
  AGENT_USE_CASE_PROMPT,
} from "../prompts";

export const PMM_THREE_ASSET = "pmm_three_asset";
/** M8–M10: campaign package (campaign plan, content matrix, sales play) for one Campaign. */
export const CAMPAIGN_GTM = "campaign_gtm";
/** M11: performance review of a campaign from its imported KPI measurements. */
export const CAMPAIGN_PERFORMANCE = "campaign_performance";
/** M12: use cases, ICP and target segments for one product (station "Use cases & ICP"). */
export const USE_CASE_DEFINITION = "use_case_definition";
/** M12: GTM strategy brief for one campaign; its approval is required before campaign_gtm. */
export const CAMPAIGN_STRATEGY = "campaign_strategy";
/** M12: communication plan for one planned release or update (station "Release & update"). */
export const RELEASE_COMMUNICATION = "release_communication";
export type RunKind =
  | typeof PMM_THREE_ASSET
  | typeof CAMPAIGN_GTM
  | typeof CAMPAIGN_PERFORMANCE
  | typeof USE_CASE_DEFINITION
  | typeof CAMPAIGN_STRATEGY
  | typeof RELEASE_COMMUNICATION;

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

/** M12: start input of the use_case_definition run. */
export const StartUseCaseInput = z.strictObject({
  kind: z.literal(USE_CASE_DEFINITION),
  productId: Id,
  market: z.string().trim().min(2).max(120),
  requestNonce: Nonce,
});

/** M12: start input of the campaign_strategy run. */
export const StartStrategyInput = z.strictObject({
  kind: z.literal(CAMPAIGN_STRATEGY),
  campaignId: Id,
  requestNonce: Nonce,
});

/** M12: start input of the release_communication run: everything else comes from the (tenant-scoped) Release record. */
export const StartReleaseInput = z.strictObject({
  kind: z.literal(RELEASE_COMMUNICATION),
  releaseId: Id,
  requestNonce: Nonce,
});

export const StartWorkflowInput = z.union([
  StartPmmInput,
  StartCampaignInput,
  StartPerformanceInput,
  StartUseCaseInput,
  StartStrategyInput,
  StartReleaseInput,
]);
export type StartWorkflowInput = z.infer<typeof StartWorkflowInput>;

/** Stored as WorkflowRun.inputRefs: ids and the market label only. */
export type RunInputRefs = Omit<z.infer<typeof StartPmmInput>, "kind" | "requestNonce">;
export type CampaignRunInputRefs = Omit<z.infer<typeof StartCampaignInput>, "kind" | "requestNonce">;
export type UseCaseRunInputRefs = Omit<z.infer<typeof StartUseCaseInput>, "kind" | "requestNonce">;
export type ReleaseRunInputRefs = Omit<z.infer<typeof StartReleaseInput>, "kind" | "requestNonce">;

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

/** M12: prompt template id → version per run kind. */
export const USE_CASE_PROMPT_VERSIONS: Record<string, string> = versions(AGENT_USE_CASE_PROMPT);
export const STRATEGY_PROMPT_VERSIONS: Record<string, string> = versions(AGENT_STRATEGY_PROMPT);
export const RELEASE_PROMPT_VERSIONS: Record<string, string> = versions(AGENT_RELEASE_PROMPT);
