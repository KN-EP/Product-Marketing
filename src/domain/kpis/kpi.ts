import { z } from "zod";
import type { CampaignPlanV1 } from "../schemas/campaign";
import { KpiAggregation, KpiDirection, KpiUnit } from "../schemas/performance";

/**
 * KPI tree (M11). KPIs are derived from the APPROVED campaign plan — the plan's
 * proposed targets are text ("To be set by the team"), so numeric targets,
 * baselines, unit, direction and aggregation are set by a human afterwards.
 */

export interface KpiSeed {
  name: string;
  funnelStage: string;
  definition: string;
  dataSource: string;
}

/** One KPI per plan KPI; names are trimmed and de-duplicated case-insensitively (first wins). */
export function kpisFromPlan(plan: z.infer<typeof CampaignPlanV1>): KpiSeed[] {
  const seen = new Set<string>();
  const out: KpiSeed[] = [];
  for (const k of plan.kpis) {
    const name = k.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, funnelStage: k.funnelStage, definition: k.definition, dataSource: k.dataSource });
  }
  return out;
}

const Amount = z.number().finite().min(-1e12).max(1e12).nullable();

/** Human edits of one KPI. Strict: names, ids and the campaign cannot be changed here. */
export const KpiPatch = z
  .strictObject({
    target: Amount.optional(),
    baseline: Amount.optional(),
    unit: KpiUnit.optional(),
    direction: KpiDirection.optional(),
    aggregation: KpiAggregation.optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Nothing to change");
export type KpiPatch = z.infer<typeof KpiPatch>;
