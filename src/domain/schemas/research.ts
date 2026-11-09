import { z } from "zod";
import { Statement } from "./common";

/**
 * M14 win/loss synthesis. Like the performance review (M11), the numbers are
 * NOT written by the model: the server computes `stats` from the consented
 * interviews (src/domain/research/win-loss.ts) and adds it, with `asOf`, to
 * the model's draft. Gate G15 checks every number a statement quotes against
 * those stats. Interview quotes are evidence excerpts of the interview sources
 * (gate G4), never paraphrases.
 */

const Label = (max: number) => z.string().min(1).max(max);
const Count = z.number().int().min(0);

export const WinLossStats = z.object({
  interviews: Count,
  excludedWithoutConsent: Count,
  won: Count,
  lost: Count,
  churned: Count,
  noDecision: Count,
  winRatePct: z.number().int().min(0).max(100).nullable(),
  reasons: z.array(
    z.object({ code: Label(40), label: Label(80), won: Count, lost: Count, churned: Count, noDecision: Count, primary: Count, total: Count }),
  ),
  competitors: z.array(z.object({ name: Label(120), won: Count, lost: Count, churned: Count, noDecision: Count })),
  segments: z.array(z.object({ segment: Label(80), interviews: Count, won: Count, lost: Count, churned: Count, noDecision: Count })),
});
export type WinLossStats = z.infer<typeof WinLossStats>;

export const ImplicationArea = z.enum(["messaging", "product", "sales_enablement", "pricing_packaging", "segment_focus", "crm_data"]);

const Driver = z.object({ theme: Label(120), reasonCodes: z.array(Label(40)).max(5).default([]), statement: Statement });

const draft = {
  summary: Statement,
  winDrivers: z.array(Driver).min(1).max(6),
  lossDrivers: z.array(Driver).min(1).max(6),
  competitorPatterns: z.array(z.object({ competitor: Label(120), statement: Statement })).max(6),
  segmentInsights: z.array(z.object({ segment: Label(80), statement: Statement })).max(6),
  implications: z.array(z.object({ area: ImplicationArea, recommendation: Statement })).min(1).max(8),
  hypothesesToValidate: z.array(z.string().min(1)).max(10),
  limitations: z.array(z.string().min(1)).min(1).max(10),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
};

/** What the model submits (no numbers of its own). */
export const WinLossSynthesisDraftV1 = z.object({ schemaVersion: z.literal("win_loss_synthesis.v1"), ...draft });

/** What is stored: the draft plus the server-computed statistics. */
export const WinLossSynthesisV1 = z.object({
  schemaVersion: z.literal("win_loss_synthesis.v1"),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stats: WinLossStats,
  ...draft,
});
export type WinLossSynthesis = z.infer<typeof WinLossSynthesisV1>;
