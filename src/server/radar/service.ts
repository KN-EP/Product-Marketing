import { createHash } from "node:crypto";
import { canReview, hasRole, type Actor } from "../../domain/actor";
import { analyseImpact, RecordChangeInput, ResolveChangeInput, type Impact } from "../../domain/regulatory/radar";
import type { Db } from "../db/client";
import { withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const day = (d: string | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, raw: unknown, what: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "invalid_input", `Invalid ${what}.`, r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

/**
 * Records a regulatory change (M16). Editors only; the watch is resolved
 * through the tenant-scoped DAL (404 on a foreign id). In ONE transaction:
 * the impact is computed against the new wording, the watched source gets the
 * new text, every claim citing it becomes stale, the deadline is updated and
 * the change is stored as an open alert. Audited with counts only.
 * Consequences elsewhere follow from the existing rules: approvals that rest on
 * the old text or a stale claim fail the gates at export; launch readiness
 * blocks every phase of an affected product until the alert is resolved.
 */
export async function recordRegulatoryChange(actor: Actor, db: Db, raw: unknown, now: Date = new Date()): Promise<{ changeId: string; impact: Impact }> {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
  const c = parse(RecordChangeInput, raw, "regulatory change");
  return withTenantTx(actor, db, async (t) => {
    const watch = await t.radar.getWatch(c.watchId);
    const newHash = sha256(c.updatedSourceText);
    if (newHash === watch.source.contentHash) throw new HttpError(409, "no_change", "The text is identical to the stored source.");

    const [claims, assets] = await Promise.all([t.claims.listRecords(), t.assets.listForImpact()]);
    const impact = analyseImpact({
      sourceId: watch.source.id,
      tenantId: actor.tenantId,
      newContent: c.updatedSourceText,
      previousDeadline: watch.currentDeadline,
      claims,
      assets,
    });

    await t.radar.updateSource(watch.source.id, c.updatedSourceText, newHash, now);
    const before = new Map(claims.map((x) => [x.id, x.state] as const));
    for (const id of impact.staleClaimIds) {
      await t.claims.setState(id, before.get(id)!, "stale", { staleReason: `Regulatory change recorded ${now.toISOString().slice(0, 10)}: ${c.kind}` });
    }
    const newDeadline = day(c.newDeadline);
    if (newDeadline || c.kind === "deadline_shift") await t.radar.setDeadline(watch.id, newDeadline);
    const { id } = await t.radar.createChange({
      watchId: watch.id,
      kind: c.kind,
      summary: c.summary,
      previousDeadline: watch.currentDeadline,
      newDeadline,
      previousContentHash: watch.source.contentHash,
      newContentHash: newHash,
      impact,
      recordedById: actor.userId!,
    });
    await t.audit.record({
      actorId: actor.userId,
      action: "regulatory.change_recorded",
      entityType: "RegulatoryChange",
      entityId: id,
      metadata: { watchId: watch.id, kind: c.kind, staleClaims: impact.staleClaimIds.length, affectedAssets: impact.affectedAssets.length, sourceId: watch.source.id },
    });
    for (const claimId of impact.staleClaimIds) {
      await t.audit.record({ actorId: actor.userId, action: "claim.stale", entityType: "Claim", entityId: claimId, metadata: { reason: "regulatory_change", changeId: id } });
    }
    return { changeId: id, impact };
  });
}

/**
 * Resolves an open alert (M16). Human reviewers only; refused (409) while any
 * claim the change made stale is still stale — re-verify it (pending review →
 * approved, with evidence that exists in the new text) or retire it (draft).
 */
export async function resolveRegulatoryChange(actor: Actor, db: Db, raw: unknown, now: Date = new Date()): Promise<{ changeId: string }> {
  if (!canReview(actor)) throw new HttpError(403, "forbidden", "Only a human reviewer can resolve a regulatory alert.");
  const r = parse(ResolveChangeInput, raw, "resolution");
  return withTenantTx(actor, db, async (t) => {
    const change = await t.radar.getChange(r.changeId);
    if (change.resolvedAt) throw new HttpError(409, "already_resolved", "The change was already resolved.");
    const impact = change.impact as unknown as Impact;
    const states = new Map((await t.claims.listRecords()).map((c) => [c.id, c.state] as const));
    const stillStale = impact.staleClaimIds.filter((id) => states.get(id) === "stale");
    if (stillStale.length) {
      throw new HttpError(409, "claims_still_stale", `Re-verify or retire the stale claim(s) first: ${stillStale.join(", ")}.`);
    }
    await t.radar.resolve(change.id, actor.userId!, r.note, now);
    await t.audit.record({
      actorId: actor.userId,
      action: "regulatory.change_resolved",
      entityType: "RegulatoryChange",
      entityId: change.id,
      metadata: { staleClaims: impact.staleClaimIds.length, affectedAssets: impact.affectedAssets.length },
    });
    return { changeId: change.id };
  });
}
