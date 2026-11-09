import { z } from "zod";
import { hasRole, type Actor } from "../../domain/actor";
import { CsvFormatError } from "../../domain/kpis/csv";
import { computeCostComparison, CostComparisonInput } from "../../domain/installed-base/cost";
import { canMove, FindingInput, handoverDueOn, HandoverUpdateInput, parseUnitsCsv, UNITS_CSV_LIMITS } from "../../domain/installed-base/installed-base";
import { reasonsOutsideProfile } from "../../domain/research/win-loss";
import type { Db } from "../db/client";
import { withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

/**
 * M18 installed base. Editors import the installed base, report findings and move
 * hand-overs; admins set the industry profile. Tenant from the actor; every id is
 * resolved through the tenant-scoped DAL (404 when foreign). Audit events carry ids,
 * counts and codes — never account labels, findings or file content.
 */

const issues = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
function requireEditor(actor: Actor): asserts actor is Actor & { userId: string } {
  if (!hasRole(actor, "editor") || !actor.userId) throw new HttpError(403, "forbidden", "Editor role required.");
}
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ImportInput = z.strictObject({ csv: z.string().min(1), fileName: z.string().trim().min(1).max(200) });

export interface UnitsImportResult {
  importId: string;
  rowCount: number;
  created: number;
  updated: number;
  rejected: { line: number; reason: string }[];
}

/**
 * Imports the installed base (CSV). Products are matched by name within the
 * tenant; a row with an unknown product is rejected. Re-importing a unit (same
 * product and unit ref) updates its facts.
 */
export async function importInstalledBase(actor: Actor, db: Db, raw: unknown, now: Date = new Date()): Promise<UnitsImportResult> {
  requireEditor(actor);
  const input = ImportInput.safeParse(raw);
  if (!input.success) throw new HttpError(400, "invalid_input", "Invalid import.", issues(input.error));
  if (Buffer.byteLength(input.data.csv, "utf8") > UNITS_CSV_LIMITS.maxBytes) {
    throw new HttpError(413, "payload_too_large", `The file exceeds ${UNITS_CSV_LIMITS.maxBytes / 1024} KB.`);
  }
  let parsed;
  try {
    parsed = parseUnitsCsv(input.data.csv, now);
  } catch (e) {
    if (e instanceof CsvFormatError) throw new HttpError(400, "invalid_csv", e.message);
    throw e;
  }
  return withTenantTx(actor, db, async (t) => {
    const products = await t.installedBase.productsByName();
    const rejected = [...parsed.rejected];
    const rows = parsed.accepted.filter((r) => {
      if (products.has(r.product.trim().toLowerCase())) return true;
      rejected.push({ line: r.line, reason: "Unknown product (create it first or use its exact name)" });
      return false;
    });
    rejected.sort((a, b) => a.line - b.line);
    const { id: importId } = await t.installedBase.createImport({
      fileName: input.data.fileName,
      rowCount: parsed.rowCount,
      acceptedRows: rows.length,
      rejectedRows: rejected.slice(0, 200),
      importedById: actor.userId,
    });
    let created = 0;
    for (const r of rows) {
      const res = await t.installedBase.upsertUnit({
        productId: products.get(r.product.trim().toLowerCase())!,
        unitRef: r.unitRef,
        accountLabel: r.accountLabel,
        region: r.region,
        application: r.application,
        installedOn: day(r.installedOn),
        serviceContract: r.serviceContract,
        sparePartOrders12m: r.sparePartOrders12m,
        materialChangePlanned: r.materialChangePlanned,
        regulatedApplication: r.regulatedApplication,
        lastServiceOn: r.lastServiceOn ? day(r.lastServiceOn) : null,
        importId,
      });
      if (res.created) created++;
    }
    await t.audit.record({
      actorId: actor.userId,
      action: "installed_base.imported",
      entityType: "InstalledBaseImport",
      entityId: importId,
      metadata: { rowCount: parsed.rowCount, created, updated: rows.length - created, rejected: rejected.length },
    });
    return { importId, rowCount: parsed.rowCount, created, updated: rows.length - created, rejected: rejected.slice(0, 50) };
  });
}

/** A finding from field service becomes a hand-over to sales, due in HANDOVER_SLA_DAYS. */
export async function reportFinding(actor: Actor, db: Db, raw: unknown, now: Date = new Date()): Promise<{ handoverId: string; dueOn: string }> {
  requireEditor(actor);
  const f = FindingInput.safeParse(raw);
  if (!f.success) throw new HttpError(400, "invalid_input", "Invalid finding.", issues(f.error));
  return withTenantTx(actor, db, async (t) => {
    const unit = await t.installedBase.getUnit(f.data.unitId);
    const dueOn = handoverDueOn(now);
    const { id } = await t.installedBase.createHandover({ unitId: unit.id, offer: f.data.offer, finding: f.data.finding, reportedById: actor.userId, reportedAt: now, dueOn });
    await t.audit.record({
      actorId: actor.userId,
      action: "handover.reported",
      entityType: "ServiceHandover",
      entityId: id,
      metadata: { unitId: unit.id, productId: unit.product.id, offer: f.data.offer, dueOn: dueOn.toISOString().slice(0, 10) },
    });
    return { handoverId: id, dueOn: dueOn.toISOString().slice(0, 10) };
  });
}

/**
 * Moves a hand-over along open → contacted → offered → won / lost / no decision.
 * Closing reasons use the win/loss reason codes of the tenant's industry profile,
 * so retrofit offers feed the same "why we win and lose" picture as interviews.
 */
export async function updateHandover(actor: Actor, db: Db, raw: unknown, now: Date = new Date()): Promise<{ handoverId: string; status: string }> {
  requireEditor(actor);
  const u = HandoverUpdateInput.safeParse(raw);
  if (!u.success) throw new HttpError(400, "invalid_input", "Invalid hand-over update.", issues(u.error));
  return withTenantTx(actor, db, async (t) => {
    const h = await t.installedBase.getHandover(u.data.handoverId);
    if (!canMove(h.status, u.data.status)) {
      throw new HttpError(409, "invalid_transition", `A hand-over cannot move from "${h.status}" to "${u.data.status}".`);
    }
    const closing = ["won", "lost", "no_decision"].includes(u.data.status);
    if (closing) {
      const outside = reasonsOutsideProfile(await t.tenant.industryProfile(), u.data.reasons);
      if (outside.length) throw new HttpError(400, "invalid_input", "Invalid hand-over update.", [{ path: "reasons", message: `Not a reason code of this tenant's industry profile: ${outside.join(", ")}` }]);
    } else if (u.data.reasons.length) {
      throw new HttpError(400, "invalid_input", "Invalid hand-over update.", [{ path: "reasons", message: "Reasons are recorded when the hand-over is closed" }]);
    }
    await t.installedBase.moveHandover(h.id, h.status, {
      status: u.data.status,
      ...(u.data.status === "contacted" ? { contactedAt: now } : {}),
      ...(u.data.status === "offered" ? { offeredAt: now } : {}),
      ...(closing ? { closedAt: now, reasons: u.data.reasons } : {}),
      ...(u.data.note !== undefined ? { note: u.data.note } : {}),
    });
    await t.audit.record({
      actorId: actor.userId,
      action: `handover.${u.data.status}`,
      entityType: "ServiceHandover",
      entityId: h.id,
      metadata: { from: h.status, to: u.data.status, offer: h.offer, reasons: u.data.reasons },
    });
    return { handoverId: h.id, status: u.data.status };
  });
}

/** Computes and stores a cost-per-part comparison. The numbers come from code, never from a model. */
export async function saveCostComparison(actor: Actor, db: Db, raw: unknown): Promise<{ comparisonId: string }> {
  requireEditor(actor);
  const c = CostComparisonInput.safeParse(raw);
  if (!c.success) throw new HttpError(400, "invalid_input", "Invalid cost comparison.", issues(c.error));
  return withTenantTx(actor, db, async (t) => {
    const product = await t.products.getById(c.data.productId);
    const unit = c.data.unitId ? await t.installedBase.getUnit(c.data.unitId) : null;
    if (unit && unit.product.id !== product.id) throw new HttpError(400, "invalid_input", "The unit belongs to another product.");
    const result = computeCostComparison(c.data.scenarios);
    const { id } = await t.installedBase.createComparison({ productId: product.id, unitId: unit?.id ?? null, title: c.data.title, inputs: c.data.scenarios, result, createdById: actor.userId });
    await t.audit.record({
      actorId: actor.userId,
      action: "cost_comparison.created",
      entityType: "CostComparison",
      entityId: id,
      metadata: { productId: product.id, unitId: unit?.id ?? null, scenarios: c.data.scenarios.map((s) => s.kind), status: result.status },
    });
    return { comparisonId: id };
  });
}

const ProfileInput = z.strictObject({ profile: z.enum(["software", "machinery"]) });

/** Admins choose the industry profile (which win/loss reason codes the tenant uses). */
export async function setIndustryProfile(actor: Actor, db: Db, raw: unknown): Promise<{ profile: string }> {
  if (!hasRole(actor, "admin") || !actor.userId) throw new HttpError(403, "forbidden", "Admin role required.");
  const p = ProfileInput.safeParse(raw);
  if (!p.success) throw new HttpError(400, "invalid_input", "Invalid profile.", issues(p.error));
  return withTenantTx(actor, db, async (t) => {
    const before = await t.tenant.industryProfile();
    await t.tenant.setIndustryProfile(p.data.profile);
    await t.audit.record({ actorId: actor.userId, action: "tenant.industry_profile", entityType: "Tenant", entityId: actor.tenantId, metadata: { from: before, to: p.data.profile } });
    return { profile: p.data.profile };
  });
}
