import { createHash } from "node:crypto";
import { hasRole, type Actor } from "../../domain/actor";
import { claimsToMarkStale } from "../../domain/claims/claim-state";
import { reasonsOutsideProfile, WinLossInterviewInput } from "../../domain/research/win-loss";
import type { Db } from "../db/client";
import { withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

const day = (d: string | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function requireEditor(actor: Actor) {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
}

/**
 * Records a win/loss interview (M14). Editors only; tenant from the actor;
 * product and competitor ids resolved through the tenant-scoped DAL (404 on
 * a foreign id). Notes are stored ONLY with granted consent, as a
 * confidential source of kind "interview". Audited with ids, outcome, reason
 * codes and consent state — never the account label or the notes.
 */
export async function recordInterview(actor: Actor, db: Db, raw: unknown, now: Date = new Date()): Promise<{ interviewId: string; sourceId: string | null }> {
  requireEditor(actor);
  const parsed = WinLossInterviewInput.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_input", "Invalid interview.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const i = parsed.data;
  return withTenantTx(actor, db, async (t) => {
    // M18: reason codes must belong to the tenant's industry profile.
    const outside = reasonsOutsideProfile(await t.tenant.industryProfile(), i.reasons);
    if (outside.length) {
      throw new HttpError(400, "invalid_input", "Invalid interview.", [{ path: "reasons", message: `Not a reason code of this tenant's industry profile: ${outside.join(", ")}` }]);
    }
    const product = await t.products.getById(i.productId);
    const competitor = i.competitorId ? await t.competitors.getById(i.competitorId) : null;
    let sourceId: string | null = null;
    if (i.consentStatus === "granted" && i.notes) {
      const content = i.notes;
      ({ id: sourceId } = await t.sources.createInterview({
        title: `Win/loss interview — ${i.accountLabel}`,
        content,
        contentHash: sha256(content),
        retrievedAt: now,
      }));
    }
    const { id } = await t.winLoss.create({
      productId: product.id,
      accountLabel: i.accountLabel,
      segment: i.segment,
      outcome: i.outcome,
      decidedOn: day(i.decidedOn),
      competitorId: competitor?.id ?? null,
      reasons: i.reasons,
      primaryReason: i.primaryReason,
      interviewedOn: day(i.interviewedOn),
      consentStatus: i.consentStatus,
      consentRecordedAt: i.consentStatus === "requested" ? null : now,
      sourceId,
    });
    await t.audit.record({
      actorId: actor.userId,
      action: "interview.recorded",
      entityType: "WinLossInterview",
      entityId: id,
      metadata: { productId: product.id, outcome: i.outcome, reasons: i.reasons, primaryReason: i.primaryReason, consent: i.consentStatus, notesStored: Boolean(sourceId) },
    });
    return { interviewId: id, sourceId };
  });
}

/**
 * Consent withdrawn (M14): the notes are erased from the interview source,
 * the source becomes invalid, claims citing it become stale, and the
 * interview drops out of every future synthesis. Approved syntheses that cite
 * it fail gate G4 again, so they can no longer be exported as approved.
 */
export async function withdrawConsent(actor: Actor, db: Db, interviewId: unknown, now: Date = new Date()): Promise<{ interviewId: string; staleClaims: number }> {
  requireEditor(actor);
  if (typeof interviewId !== "string" || interviewId.length === 0 || interviewId.length > 64) {
    throw new HttpError(400, "invalid_input", "Invalid interview id.");
  }
  return withTenantTx(actor, db, async (t) => {
    const interview = await t.winLoss.getById(interviewId);
    if (interview.consentStatus === "withdrawn") throw new HttpError(409, "already_withdrawn", "Consent was already withdrawn.");
    await t.winLoss.markWithdrawn(interview.id, now);
    let staleClaims = 0;
    if (interview.sourceId) {
      const placeholder = `[Erased ${now.toISOString().slice(0, 10)}: the interviewee withdrew consent. The notes were deleted.]`;
      await t.sources.erase(interview.sourceId, placeholder, sha256(placeholder));
      for (const c of claimsToMarkStale(interview.sourceId, await t.claims.listRecords())) {
        await t.claims.setState(c.id, (await t.claims.getRecord(c.id)).state, "stale", { staleReason: "Interview consent withdrawn" });
        staleClaims++;
      }
    }
    await t.audit.record({
      actorId: actor.userId,
      action: "interview.consent_withdrawn",
      entityType: "WinLossInterview",
      entityId: interview.id,
      metadata: { notesErased: Boolean(interview.sourceId), staleClaims },
    });
    return { interviewId: interview.id, staleClaims };
  });
}
