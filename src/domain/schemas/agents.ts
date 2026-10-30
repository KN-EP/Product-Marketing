import { z } from "zod";
import { CampaignPlanV1, ContentMatrixV1, SalesPlayV1 } from "./campaign";
import { ProofPoint, Statement } from "./common";
import { PerformanceReviewV1 } from "./performance";
import { ReleaseCommunicationPlanV1 } from "./release";
import { GtmStrategyBriefV1, UseCaseMapV1 } from "./strategy";

// ── Agent A: Product & Market Intelligence ──
export const ProductIntelligenceBriefV1 = z.object({
  schemaVersion: z.literal("product_intelligence_brief.v1"),
  summary: Statement,
  buyerProblems: z.array(Statement).min(1).max(10),
  possibleDifferentiation: z.array(Statement).max(10),
  missingEvidence: z.array(z.string().min(1)).max(20),
  questionsForProductExperts: z.array(z.string().min(1)).max(20),
});

// ── Agent B: Positioning & Messaging ──
export const MessagingFrameworkV1 = z.object({
  schemaVersion: z.literal("messaging_framework.v1"),
  positioningStatement: Statement,
  valueProposition: Statement,
  pillars: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        message: Statement,
        proofPoints: z.array(ProofPoint).min(1).max(5),
      }),
    )
    .length(3),
  objections: z.array(z.object({ objection: z.string().min(1), response: Statement })).max(10),
  unansweredQuestions: z.array(z.string().min(1)).max(20),
  risksAndCaveats: z.array(z.string().min(1)).max(20),
});

// ── Agent C: Competitive & GTM Enablement ──
export const CompetitiveBattlecardV1 = z.object({
  schemaVersion: z.literal("competitive_battlecard.v1"),
  competitors: z
    .array(
      z.object({
        competitorId: z.string().min(1),
        name: z.string().min(1),
        theirPositioning: Statement,
        whereWeWin: z.array(Statement).max(6),
        landmines: z.array(Statement).max(6),
      }),
    )
    .min(1)
    .max(5),
  permittedComparativeClaims: z.array(Statement).max(15),
  discoveryQuestions: z.array(z.string().min(1)).min(3).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});

export const RegulatoryGtmBriefV1 = z.object({
  schemaVersion: z.literal("regulatory_gtm_brief.v1"),
  regulatoryContext: Statement,
  buyerImplications: z.array(Statement).min(1).max(10),
  messagingImplications: z.array(Statement).max(10),
  salesDiscoveryQuestions: z.array(z.string().min(1)).min(3).max(15),
  plays: z.array(z.object({ name: z.string().min(1), description: Statement })).max(6),
  doNotSay: z.array(z.string().min(1)).max(20),
  expertValidationRequired: z.array(z.string().min(1)).max(20),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});

export const ASSET_SCHEMAS = {
  product_intelligence_brief: ProductIntelligenceBriefV1,
  messaging_framework: MessagingFrameworkV1,
  competitive_battlecard: CompetitiveBattlecardV1,
  regulatory_gtm_brief: RegulatoryGtmBriefV1,
  // M8–M10 campaign package (src/domain/schemas/campaign.ts)
  campaign_plan: CampaignPlanV1,
  content_matrix: ContentMatrixV1,
  sales_play: SalesPlayV1,
  // M12 strategy first (src/domain/schemas/strategy.ts, release.ts)
  use_case_map: UseCaseMapV1,
  gtm_strategy_brief: GtmStrategyBriefV1,
  release_communication_plan: ReleaseCommunicationPlanV1,
  // M11 (src/domain/schemas/performance.ts) — stored form incl. the server-computed kpiSnapshot
  performance_review: PerformanceReviewV1,
} as const;

export type AssetType = keyof typeof ASSET_SCHEMAS;
export const ASSET_TYPES = Object.keys(ASSET_SCHEMAS) as AssetType[];

export interface LocatedStatement {
  path: string;
  s: Statement;
}

/**
 * Walk an output and collect every object that is a Statement. Structural, so
 * new schema fields are covered by the gates without extra wiring.
 */
export function collectStatements(value: unknown, path = "$"): LocatedStatement[] {
  const out: LocatedStatement[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...collectStatements(v, `${path}[${i}]`)));
    return out;
  }
  if (value && typeof value === "object") {
    if ("kind" in value && "text" in value) {
      const parsed = Statement.safeParse(value);
      if (parsed.success) out.push({ path, s: parsed.data });
    }
    for (const [k, v] of Object.entries(value)) {
      if (v && typeof v === "object") out.push(...collectStatements(v, `${path}.${k}`));
    }
  }
  return out;
}
