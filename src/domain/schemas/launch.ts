import { z } from "zod";
import { Statement } from "./common";

/**
 * M15 station "Launch": a staged launch plan. The phases, tier and dates come
 * from the human launch briefing; the agent drafts objectives, activities,
 * exit criteria, a proof plan and the enablement plan. The server attaches the
 * computed `readiness` (per phase: checks and status) — the model never decides
 * whether a phase is ready, and never says "go".
 */

const Label = (max: number) => z.string().min(1).max(max);

export const LaunchTier = z.enum(["tier_1", "tier_2", "tier_3"]);
export type LaunchTier = z.infer<typeof LaunchTier>;
export const LaunchPhase = z.enum(["early_access", "general_availability", "customer_launch", "market_launch"]);
export type LaunchPhase = z.infer<typeof LaunchPhase>;
export const LAUNCH_PHASES = LaunchPhase.options;

export const ReadinessCheck = z.object({
  id: Label(60),
  label: Label(160),
  required: z.boolean(),
  status: z.enum(["pass", "fail", "na"]),
  detail: z.string().max(300),
});
export type ReadinessCheck = z.infer<typeof ReadinessCheck>;

export const PhaseReadiness = z.object({
  phase: LaunchPhase,
  plannedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(["go", "go_with_risks", "no_go"]),
  checks: z.array(ReadinessCheck),
});
export type PhaseReadiness = z.infer<typeof PhaseReadiness>;

export const LaunchReadiness = z.object({ tier: LaunchTier, phases: z.array(PhaseReadiness).length(4) });
export type LaunchReadiness = z.infer<typeof LaunchReadiness>;

const draft = {
  tierRationale: Statement,
  launchNarrative: Statement,
  phases: z
    .array(
      z.object({
        phase: LaunchPhase,
        timing: Label(60),
        owner: Label(80),
        objective: Statement,
        audiences: z.array(Label(80)).min(1).max(5),
        activities: z.array(Statement).min(1).max(6),
        exitCriteria: z.array(z.string().min(1).max(240)).min(1).max(6),
      }),
    )
    .min(1)
    .max(4),
  proofPlan: z.array(z.object({ gap: z.string().min(1).max(240), action: Statement })).min(1).max(6),
  enablementPlan: z.array(z.object({ audience: Label(80), deliverable: Label(120), dueBy: Label(60) })).min(1).max(8),
  successSignals: z.array(z.object({ phase: LaunchPhase, signal: z.string().min(1).max(240) })).min(1).max(8),
  risks: z.array(z.string().min(1)).max(15),
  openQuestions: z.array(z.string().min(1)).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
};

/** What the model submits. */
export const LaunchPlanDraftV1 = z.object({ schemaVersion: z.literal("launch_plan.v1"), ...draft });

/** What is stored: the draft plus the server-computed readiness at generation time. */
export const LaunchPlanV1 = z.object({
  schemaVersion: z.literal("launch_plan.v1"),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readiness: LaunchReadiness,
  ...draft,
});
export type LaunchPlan = z.infer<typeof LaunchPlanV1>;
