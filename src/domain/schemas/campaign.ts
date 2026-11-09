import { z } from "zod";
import { ChannelType } from "./channels";
import { Statement } from "./common";

/**
 * Output schemas of the campaign package (M8–M10). Everything a reader could
 * take as a statement about the product, the market or the buyer is a
 * Statement, so the quality gates (claims, excerpts, unsupported or absolute
 * assertions, regulatory and comparative checks) apply without extra wiring.
 * Plain strings are reserved for labels, timings and planning notes.
 */

export const CampaignType = z.enum(["demand_generation", "conversion", "retention", "loyalty", "sales_enablement"]);
export type CampaignType = z.infer<typeof CampaignType>;

export const FunnelStage = z.enum(["awareness", "consideration", "decision", "onboarding", "retention", "advocacy"]);
export type FunnelStage = z.infer<typeof FunnelStage>;

export const PlayType = z.enum(["outreach_sequence", "retention_play", "loyalty_play"]);
export type PlayType = z.infer<typeof PlayType>;

export const PlayChannel = z.enum(["email", "linkedin", "phone", "meeting", "event", "in_product", "customer_success_call"]);

const Label = (max: number) => z.string().min(1).max(max);

// ── Agent D: Campaign planning (F1) ──
export const CampaignPlanV1 = z.object({
  schemaVersion: z.literal("campaign_plan.v1"),
  campaignType: CampaignType,
  objective: Statement,
  targetAudience: Statement,
  coreMessage: Statement,
  channelMix: z
    .array(
      z.object({
        channel: Label(60),
        /** M12: communication channel (message) or sales channel (deal / renewal). Optional for plans stored before M12. */
        channelType: ChannelType.optional(),
        funnelStage: FunnelStage,
        role: Statement,
      }),
    )
    .min(1)
    .max(8),
  phases: z
    .array(z.object({ name: Label(80), timing: Label(80), activities: z.array(Statement).min(1).max(8) }))
    .min(1)
    .max(6),
  kpis: z
    .array(
      z.object({
        name: Label(80),
        funnelStage: FunnelStage,
        definition: Label(300),
        /** A proposal for the team to confirm ("to be set" without a baseline) — never a promised result. */
        proposedTarget: Label(120),
        dataSource: Label(120),
      }),
    )
    .min(1)
    .max(10),
  assetList: z
    .array(z.object({ name: Label(120), channel: Label(60), funnelStage: FunnelStage }))
    .min(1)
    .max(15),
  risksAndAssumptions: z.array(z.string().min(1)).max(15),
  openQuestions: z.array(z.string().min(1)).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});

// ── Agent E: Content & communication (F4) ──
export const ContentMatrixV1 = z.object({
  schemaVersion: z.literal("content_matrix.v1"),
  contentPillars: z
    .array(z.object({ title: Label(80), rationale: Statement }))
    .min(1)
    .max(5),
  items: z
    .array(
      z.object({
        funnelStage: FunnelStage,
        channel: Label(60),
        format: Label(60),
        headline: Statement,
        body: Statement,
        callToAction: Label(160),
      }),
    )
    .min(1)
    .max(12),
  toneOfVoice: z.array(Label(200)).min(1).max(10),
  doNotSay: z.array(z.string().min(1)).max(20),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});

// ── Agent F: Sales, retention & loyalty plays (F2) ──
export const SalesPlayV1 = z.object({
  schemaVersion: z.literal("sales_play.v1"),
  playType: PlayType,
  whenToUse: Statement,
  targetPersona: Label(120),
  steps: z
    .array(
      z.object({
        dayOffset: z.number().int().min(0).max(180),
        channel: PlayChannel,
        objective: Label(200),
        message: Statement,
      }),
    )
    .min(2)
    .max(10),
  objectionHandling: z.array(z.object({ objection: z.string().min(1), response: Statement })).max(10),
  discoveryQuestions: z.array(z.string().min(1)).min(3).max(15),
  successSignals: z.array(z.string().min(1)).min(1).max(10),
  /** Customer data the play needs to be targeted (CRM, usage, NPS). Non-empty = generic playbook until that data exists. */
  dataRequirements: z.array(z.string().min(1)).max(10),
  handoffRules: z.array(z.string().min(1)).max(10),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});
