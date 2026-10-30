import { z } from "zod";
import { ChannelType } from "./channels";
import { Statement } from "./common";

/**
 * M12 station "Release & update": release and update planning and
 * communication. The release briefing (what changes, when, for whom) is human
 * input; the communication plan is a draft for people to review and send.
 */

const Label = (max: number) => z.string().min(1).max(max);

export const ReleaseType = z.enum(["major_release", "feature_update", "maintenance_update", "security_update", "deprecation"]);
export type ReleaseType = z.infer<typeof ReleaseType>;

export const ReleaseAudience = z.enum(["existing_customers", "prospects", "partners_resellers", "internal_sales", "internal_support"]);
export type ReleaseAudience = z.infer<typeof ReleaseAudience>;

export const ReleasePhase = z.enum(["internal_enablement", "pre_announcement", "launch", "follow_up"]);

export const ReleaseCommunicationPlanV1 = z.object({
  schemaVersion: z.literal("release_communication_plan.v1"),
  /** Tier 1 = broad launch with campaign, tier 3 = release notes only. A proposal for the team. */
  releaseTier: z.enum(["tier_1", "tier_2", "tier_3"]),
  tierRationale: Statement,
  summary: Statement,
  audiences: z
    .array(
      z.object({
        audience: ReleaseAudience,
        whatChanges: Statement,
        keyMessage: Statement,
        actionRequired: Label(240),
        channels: z
          .array(z.object({ channelType: ChannelType, channel: Label(60) }))
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(5),
  timeline: z
    .array(z.object({ phase: ReleasePhase, timing: Label(60), owner: Label(80), activities: z.array(Statement).min(1).max(6) }))
    .min(2)
    .max(8),
  releaseNotesDraft: z
    .array(z.object({ heading: Label(120), body: Statement }))
    .min(1)
    .max(10),
  customerUpdateNotice: z.object({ subject: Label(160), body: Statement }),
  salesAndSupportFaq: z
    .array(z.object({ question: z.string().min(1).max(300), answer: Statement }))
    .min(1)
    .max(10),
  risksAndDependencies: z.array(z.string().min(1)).max(15),
  openQuestions: z.array(z.string().min(1)).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});
