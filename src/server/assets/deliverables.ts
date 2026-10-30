import type { AssetType } from "../../domain/schemas/agents";
import { HttpError } from "../errors";

/**
 * The pmm_three_asset run has THREE deliverables (messaging framework,
 * battlecard, regulatory brief). Agent A's product intelligence brief is an
 * internal input: it is stored for traceability but never enters review,
 * never counts as an asset and can never be exported.
 * The campaign_gtm run (M8–M10) has three more: campaign plan, content
 * matrix, sales play — all reviewed like any other deliverable.
 */
export const INTERNAL_ASSET_TYPES: readonly AssetType[] = ["product_intelligence_brief"];
export const PMM_DELIVERABLE_TYPES: readonly AssetType[] = ["messaging_framework", "competitive_battlecard", "regulatory_gtm_brief"];
export const CAMPAIGN_DELIVERABLE_TYPES: readonly AssetType[] = ["campaign_plan", "content_matrix", "sales_play"];
/** M11: performance review of a campaign (campaign_performance run). */
export const PERFORMANCE_DELIVERABLE_TYPES: readonly AssetType[] = ["performance_review"];
/** M12: use case map (product), GTM strategy brief (campaign), release communication plan (release). */
export const STRATEGY_DELIVERABLE_TYPES: readonly AssetType[] = ["use_case_map", "gtm_strategy_brief", "release_communication_plan"];
export const DELIVERABLE_ASSET_TYPES: readonly AssetType[] = [
  ...PMM_DELIVERABLE_TYPES,
  ...CAMPAIGN_DELIVERABLE_TYPES,
  ...PERFORMANCE_DELIVERABLE_TYPES,
  ...STRATEGY_DELIVERABLE_TYPES,
];

export const INPUT_BRIEF_LABEL = "Input brief (internal — not for external use)";

export function isInternalAssetType(type: string): boolean {
  return (INTERNAL_ASSET_TYPES as readonly string[]).includes(type);
}

export function assertDeliverable(type: string): void {
  if (isInternalAssetType(type)) {
    throw new HttpError(409, "internal_input", "The input brief is internal: it is not reviewed, edited or exported.");
  }
}
