import { z } from "zod";
import { SalesChannel } from "./channels";
import { Statement } from "./common";

/**
 * M12 "strategy first": the use case map (station "Use cases & ICP", per
 * product) and the GTM strategy brief (first step of every campaign, approved
 * by a human before the campaign package can be generated). Everything a
 * reader could take as a statement about the product, the market or the buyer
 * is a Statement, so the quality gates apply without extra wiring.
 */

const Label = (max: number) => z.string().min(1).max(max);

export const Priority = z.enum(["high", "medium", "low"]);
export const SegmentPriority = z.enum(["primary", "secondary", "later"]);
export const BuyingRole = z.enum(["decision_maker", "influencer", "user", "gatekeeper", "champion"]);
export const EvidenceStatus = z.enum(["supported", "partially_supported", "unsupported"]);

const Icp = z.object({
  summary: Statement,
  /** Firmographic criteria (industry, size, region, maturity) — labels, not claims. */
  criteria: z.array(Label(160)).min(1).max(10),
  buyingTriggers: z.array(Statement).min(1).max(8),
  disqualifiers: z.array(z.string().min(1)).max(10),
});

const BuyingCenterRole = z.object({
  role: Label(120),
  buyingRole: BuyingRole,
  concern: Statement,
  messageFocus: Statement,
});

// ── Use case agent: use cases, ICP and target segments per product ──
export const UseCaseMapV1 = z.object({
  schemaVersion: z.literal("use_case_map.v1"),
  icp: Icp,
  targetSegments: z
    .array(z.object({ name: Label(120), description: Statement, priority: SegmentPriority }))
    .min(1)
    .max(5),
  buyingCenter: z.array(BuyingCenterRole).min(1).max(8),
  useCases: z
    .array(
      z.object({
        title: Label(120),
        segment: Label(120),
        primaryRole: Label(120),
        problem: Statement,
        trigger: Statement,
        desiredOutcome: Statement,
        /** Product capabilities the use case relies on — facts need approved claims. */
        capabilities: z.array(Statement).min(1).max(6),
        evidenceStatus: EvidenceStatus,
        priority: Priority,
      }),
    )
    .min(1)
    .max(8),
  missingEvidence: z.array(z.string().min(1)).max(20),
  openQuestions: z.array(z.string().min(1)).max(20),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});

// ── Strategy agent: GTM strategy brief per campaign (before plan, content and plays) ──
export const GtmStrategyBriefV1 = z.object({
  schemaVersion: z.literal("gtm_strategy_brief.v1"),
  campaignHypothesis: Statement,
  icp: Icp,
  targetSegments: z
    .array(z.object({ name: Label(120), rationale: Statement, priority: SegmentPriority }))
    .min(1)
    .max(4),
  buyingCenter: z.array(BuyingCenterRole).min(1).max(6),
  prioritizedUseCases: z
    .array(z.object({ title: Label(120), problem: Statement, valueForCustomer: Statement, priority: Priority }))
    .min(1)
    .max(5),
  positioning: Statement,
  channelStrategy: z.object({
    communicationChannels: z
      .array(z.object({ channel: Label(60), segment: Label(120), role: Statement }))
      .min(1)
      .max(8),
    salesChannels: z
      .array(z.object({ channel: SalesChannel, role: Statement, handoff: Label(240) }))
      .min(1)
      .max(5),
  }),
  successCriteria: z.array(Label(200)).min(1).max(8),
  assumptions: z.array(z.string().min(1)).max(15),
  openQuestions: z.array(z.string().min(1)).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});
