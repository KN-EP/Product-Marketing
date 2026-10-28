"use server";

import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { createKpiTree, importKpiCsv, updateKpi } from "@/server/kpis/service";

/** Create the campaign's KPI tree from its approved campaign plan (editors). */
export async function createKpiTreeAction(campaignId: string) {
  return runAction((actor) => {
    enforceRateLimit("kpiWrite", `${actor.tenantId}:${actor.userId}`);
    return createKpiTree(actor, getDb(), campaignId);
  });
}

/** Set target, baseline, unit, direction or aggregation of one KPI (editors). */
export async function updateKpiAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("kpiWrite", `${actor.tenantId}:${actor.userId}`);
    return updateKpi(actor, getDb(), input);
  });
}

/** Import KPI measurements from CSV text (editors; ≤ 200 KB, ≤ 5,000 rows). */
export async function importKpiCsvAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("kpiWrite", `${actor.tenantId}:${actor.userId}`);
    return importKpiCsv(actor, getDb(), input);
  });
}
