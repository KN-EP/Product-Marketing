import { z } from "zod";
import { hasRole, type Actor } from "../../domain/actor";
import { CSV_LIMITS, CsvFormatError, parseKpiCsv } from "../../domain/kpis/csv";
import { KpiPatch, kpisFromPlan } from "../../domain/kpis/kpi";
import { CampaignPlanV1 } from "../../domain/schemas/campaign";
import type { Db } from "../db/client";
import { withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

/**
 * KPI tree, KPI edits and CSV imports (M11). Editors only; tenant from the
 * actor; every id is resolved through the tenant-scoped DAL (404 when foreign).
 * Audit events carry ids and counts only — never file content or values.
 */

const Id = z.string().trim().min(1).max(64);

function requireEditor(actor: Actor) {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
}

const issues = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

/** Creates the campaign's KPIs from its APPROVED campaign plan (once). */
export async function createKpiTree(actor: Actor, db: Db, rawCampaignId: unknown): Promise<{ campaignId: string; kpis: number }> {
  requireEditor(actor);
  const campaignId = Id.parse(rawCampaignId);
  return withTenantTx(actor, db, async (t) => {
    const campaign = await t.campaigns.getById(campaignId);
    if ((await t.kpis.count(campaign.id)) > 0) throw new HttpError(409, "kpi_tree_exists", "This campaign already has a KPI tree.");
    const plan = await t.assets.latestApprovedForCampaign("campaign_plan", campaign.id);
    if (!plan) throw new HttpError(409, "plan_not_approved", "Approve the campaign plan first — KPIs come from the approved plan.");
    const parsed = CampaignPlanV1.safeParse(plan.content);
    if (!parsed.success) throw new HttpError(409, "plan_invalid", "The approved campaign plan does not match campaign_plan.v1.");
    const seeds = kpisFromPlan(parsed.data);
    await t.kpis.createFromPlan(campaign.id, seeds, plan.versionId);
    await t.audit.record({
      actorId: actor.userId,
      action: "kpi_tree.created",
      entityType: "Campaign",
      entityId: campaign.id,
      metadata: { kpis: seeds.length, planVersionId: plan.versionId },
    });
    return { campaignId: campaign.id, kpis: seeds.length };
  });
}

const UpdateKpiInput = z.object({ kpiId: Id }).passthrough();

/** Target, baseline, unit, direction or aggregation of one KPI. */
export async function updateKpi(actor: Actor, db: Db, raw: unknown): Promise<{ kpiId: string }> {
  requireEditor(actor);
  const head = UpdateKpiInput.safeParse(raw);
  if (!head.success) throw new HttpError(400, "invalid_input", "Invalid KPI update.", issues(head.error));
  const { kpiId, ...rest } = head.data;
  const patch = KpiPatch.safeParse(rest);
  if (!patch.success) throw new HttpError(400, "invalid_input", "Invalid KPI update.", issues(patch.error));
  return withTenantTx(actor, db, async (t) => {
    const kpi = await t.kpis.getById(kpiId);
    await t.kpis.update(kpi.id, patch.data);
    await t.audit.record({
      actorId: actor.userId,
      action: "kpi.updated",
      entityType: "Kpi",
      entityId: kpi.id,
      metadata: { campaignId: kpi.campaignId, fields: Object.keys(patch.data).sort() },
    });
    return { kpiId: kpi.id };
  });
}

const ImportInput = z.strictObject({
  campaignId: Id,
  fileName: z.string().trim().min(1).max(200),
  csv: z.string(),
});

export interface ImportResult {
  importId: string;
  rowCount: number;
  accepted: number;
  rejected: { line: number; reason: string }[];
}

/**
 * Imports measurements (kpi, date, value). Accepted rows are stored (same KPI
 * and date → replaced); rejected rows are reported with line and reason.
 */
export async function importKpiCsv(actor: Actor, db: Db, raw: unknown): Promise<ImportResult> {
  requireEditor(actor);
  const input = ImportInput.safeParse(raw);
  if (!input.success) throw new HttpError(400, "invalid_input", "Invalid import.", issues(input.error));
  if (Buffer.byteLength(input.data.csv, "utf8") > CSV_LIMITS.maxBytes) {
    throw new HttpError(413, "payload_too_large", `The file exceeds ${CSV_LIMITS.maxBytes / 1024} KB.`);
  }
  return withTenantTx(actor, db, async (t) => {
    const campaign = await t.campaigns.getById(input.data.campaignId);
    const kpis = await t.kpis.listForCampaign(campaign.id);
    if (kpis.length === 0) throw new HttpError(409, "no_kpi_tree", "Create the KPI tree before importing measurements.");
    let parsed;
    try {
      parsed = parseKpiCsv(input.data.csv, kpis.map((k) => k.name));
    } catch (e) {
      if (e instanceof CsvFormatError) throw new HttpError(400, "invalid_csv", e.message);
      throw e;
    }
    const idByName = new Map(kpis.map((k) => [k.name, k.id]));
    const { id: importId } = await t.kpis.createImport({
      campaignId: campaign.id,
      fileName: input.data.fileName,
      rowCount: parsed.rowCount,
      acceptedRows: parsed.accepted.length,
      rejectedRows: parsed.rejected.slice(0, 200),
      importedById: actor.userId,
    });
    for (const row of parsed.accepted) {
      await t.kpis.upsertMeasurement({
        kpiId: idByName.get(row.kpiName)!,
        periodStart: new Date(`${row.periodStart}T00:00:00Z`),
        value: row.value,
        importId,
      });
    }
    await t.audit.record({
      actorId: actor.userId,
      action: "kpi.imported",
      entityType: "Campaign",
      entityId: campaign.id,
      metadata: { importId, rowCount: parsed.rowCount, accepted: parsed.accepted.length, rejected: parsed.rejected.length },
    });
    return { importId, rowCount: parsed.rowCount, accepted: parsed.accepted.length, rejected: parsed.rejected.slice(0, 50) };
  });
}
