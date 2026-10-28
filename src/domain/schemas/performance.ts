import { z } from "zod";
import { Statement } from "./common";

/**
 * Performance review (M11, F5). The KPI numbers are NOT written by the model:
 * the server computes `kpiSnapshot` deterministically from the imported
 * measurements (src/domain/kpis/analysis.ts) and adds it, with `asOf`, to the
 * model's draft. Statements point at KPIs by name in `kpiRefs`; gate G10
 * checks that every number they quote exists in the referenced KPI results.
 */

const Label = (max: number) => z.string().min(1).max(max);
const Num = z.number().finite().nullable();

export const KpiStatus = z.enum(["on_track", "at_risk", "off_track", "no_target", "no_data"]);
export type KpiStatus = z.infer<typeof KpiStatus>;
export const KpiUnit = z.enum(["count", "percent", "currency_eur", "ratio"]);
export const KpiDirection = z.enum(["higher_is_better", "lower_is_better"]);
export const KpiAggregation = z.enum(["sum", "latest", "average"]);

export const KpiResult = z.object({
  name: Label(80),
  funnelStage: Label(40),
  unit: KpiUnit,
  direction: KpiDirection,
  aggregation: KpiAggregation,
  target: Num,
  baseline: Num,
  actual: Num,
  /** Target pro rata to the elapsed campaign time (sum KPIs with a timeframe); otherwise the target. */
  expectedToDate: Num,
  /** (actual − target) / target, in percent. */
  deviationPct: Num,
  /** actual vs. expected-to-date, in percent (inverted for lower-is-better KPIs). */
  pacePct: Num,
  status: KpiStatus,
  measurements: z.number().int().min(0),
});
export type KpiResult = z.infer<typeof KpiResult>;

const draft = {
  summary: Statement,
  findings: z
    .array(z.object({ title: Label(120), observation: Statement, likelyCauses: z.array(Statement).max(5) }))
    .min(1)
    .max(10),
  recommendations: z
    .array(
      z.object({
        title: Label(120),
        action: Statement,
        expectedEffect: Statement,
        effort: z.enum(["low", "medium", "high"]),
        owner: Label(80),
      }),
    )
    .min(1)
    .max(8),
  dataGaps: z.array(z.string().min(1)).max(10),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
};

/** What agent G produces (tool input). */
export const PerformanceReviewDraftV1 = z.object({ schemaVersion: z.literal("performance_review.v1"), ...draft });

/** What is stored and gated: the draft plus the server-computed KPI results. */
export const PerformanceReviewV1 = z.object({
  schemaVersion: z.literal("performance_review.v1"),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kpiSnapshot: z.array(KpiResult).min(1).max(30),
  ...draft,
});
export type PerformanceReviewV1 = z.infer<typeof PerformanceReviewV1>;
