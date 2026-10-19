import { randomUUID } from "node:crypto";
import { DomainError, hasRole, type Actor } from "../../domain/actor";
import {
  addVersion,
  currentVersion,
  decide,
  latestApprovedVersion,
  submitForReview,
  type Decision,
} from "../../domain/assets/asset-state";
import { transitionClaim } from "../../domain/claims/claim-state";
import type { ClaimState } from "../../domain/knowledge/snapshot";
import { exportApprovedMarkdown } from "../../domain/export/markdown";
import type { Db } from "../db/client";
import { tenantDb, withTenantTx } from "../db/tenant-scope";
import { HttpError } from "../errors";

/**
 * Review persistence. Every state change goes through the domain functions in
 * src/domain/assets, src/domain/claims and src/domain/export, inside one
 * transaction, and writes an AuditEvent with sanitized metadata (ids, states,
 * counts — no content, no comment text). AssetVersion rows are insert-only.
 */

const MAX_CONTENT_BYTES = 256 * 1024;

function requireEditor(actor: Actor) {
  if (!hasRole(actor, "editor")) throw new DomainError("forbidden", "Insufficient role");
}

const critical = (r: { findings: { severity: string }[] }) => r.findings.filter((f) => f.severity === "critical").length;

export async function submitAssetForReview(actor: Actor, db: Db, assetId: string) {
  requireEditor(actor);
  return withTenantTx(actor, db, async (t) => {
    const rec = await t.assets.getRecord(assetId);
    const next = submitForReview(rec, actor);
    await t.assets.setState(assetId, [rec.state], next.state);
    await t.audit.record({
      actorId: actor.userId,
      action: "asset.pending_review",
      entityType: "Asset",
      entityId: assetId,
      metadata: { from: rec.state, to: next.state, versionId: rec.currentVersionId },
    });
    return { assetId, state: next.state };
  });
}

export async function decideAsset(
  actor: Actor,
  db: Db,
  input: { assetId: string; versionId: string; decision: Decision; comment?: string; expertReviewAcknowledged?: boolean },
) {
  try {
    return await withTenantTx(actor, db, async (t) => {
      const rec = await t.assets.getRecord(input.assetId);
      // Gates re-run inside decide() against the CURRENT database snapshot.
      const { snapshot } = await t.knowledge.snapshot();
      const r = decide(rec, actor, snapshot, {
        versionId: input.versionId,
        decision: input.decision,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.expertReviewAcknowledged !== undefined ? { expertReviewAcknowledged: input.expertReviewAcknowledged } : {}),
      });
      await t.assets.insertApproval(r.approval);
      await t.assets.setState(input.assetId, ["pending_review"], r.asset.state);
      await t.audit.record({
        actorId: actor.userId,
        action: `asset.decision.${input.decision}`,
        entityType: "Asset",
        entityId: input.assetId,
        metadata: {
          versionId: input.versionId,
          decision: input.decision,
          from: rec.state,
          to: r.asset.state,
          hasComment: Boolean(r.approval.comment),
          expertReviewAcknowledged: Boolean(input.expertReviewAcknowledged),
          ...(r.gateReport ? { gatesPassed: r.gateReport.passed, criticalFindings: critical(r.gateReport) } : {}),
        },
      });
      return { assetId: input.assetId, state: r.asset.state, decision: input.decision };
    });
  } catch (e) {
    // A blocked approval is itself an auditable decision attempt.
    if (e instanceof DomainError && (e.code === "gates_failed" || e.code === "expert_ack_required")) {
      await tenantDb(actor, db).audit.record({
        actorId: actor.userId,
        action: "asset.approval_blocked",
        entityType: "Asset",
        entityId: input.assetId,
        metadata: { versionId: input.versionId, reason: e.code },
      });
    }
    throw e;
  }
}

/** A human edit: always a NEW immutable version (draft); approved versions stay untouched. */
export async function createDraftVersion(actor: Actor, db: Db, input: { assetId: string; content: unknown }) {
  const size = Buffer.byteLength(JSON.stringify(input.content ?? null), "utf8");
  if (size > MAX_CONTENT_BYTES) throw new HttpError(413, "payload_too_large", `Content exceeds ${MAX_CONTENT_BYTES} bytes.`);
  return withTenantTx(actor, db, async (t) => {
    const rec = await t.assets.getRecord(input.assetId);
    const base = currentVersion(rec);
    const { snapshot } = await t.knowledge.snapshot();
    // generationMode has no "human" value; the edit inherits its base version's mode
    // and the audit event records source=human_edit.
    const next = addVersion(rec, input.content, actor, snapshot, { id: randomUUID(), generationMode: base?.generationMode ?? "simulated" });
    const v = currentVersion(next)!;
    await t.assets.insertVersion(v, null);
    await t.assets.setState(input.assetId, [rec.state], next.state, v.id);
    await t.audit.record({
      actorId: actor.userId,
      action: "asset.version_created",
      entityType: "Asset",
      entityId: input.assetId,
      metadata: {
        source: "human_edit",
        versionId: v.id,
        versionNumber: v.versionNumber,
        basedOnVersionId: base?.id ?? null,
        from: rec.state,
        to: next.state,
        gatesPassed: v.gatesPassed,
        criticalFindings: critical(v.gateReport),
      },
    });
    return { assetId: input.assetId, versionId: v.id, versionNumber: v.versionNumber, gatesPassed: v.gatesPassed, state: next.state };
  });
}

/** Markdown of the latest APPROVED version (domain refuses drafts). */
export async function exportAssetMarkdown(actor: Actor, db: Db, assetId: string) {
  const tdb = tenantDb(actor, db);
  const rec = await tdb.assets.getRecord(assetId);
  const { snapshot } = await tdb.knowledge.snapshot();
  const names = await tdb.memberNames([...new Set(rec.approvals.map((a) => a.reviewerId))]);
  const markdown = exportApprovedMarkdown(rec, actor, snapshot, (id) => names.get(id) ?? "Former member");
  const approved = latestApprovedVersion(rec)!;
  await tdb.audit.record({
    actorId: actor.userId,
    action: "asset.exported",
    entityType: "Asset",
    entityId: assetId,
    metadata: { versionId: approved.version.id, versionNumber: approved.version.versionNumber, format: "markdown" },
  });
  return { assetId, versionId: approved.version.id, markdown };
}

export async function transitionClaimState(actor: Actor, db: Db, input: { claimId: string; to: ClaimState; reason?: string }) {
  return withTenantTx(actor, db, async (t) => {
    const claim = await t.claims.getRecord(input.claimId);
    const { snapshot } = await t.knowledge.snapshot();
    const r = transitionClaim(claim, input.to, actor, snapshot, input.reason ? { reason: input.reason } : {});
    await t.claims.setState(input.claimId, claim.state, input.to, {
      ...(r.reviewerId ? { reviewerId: r.reviewerId } : {}),
      ...(r.approvedAt ? { approvedAt: r.approvedAt } : {}),
      ...(r.lastVerifiedAt ? { lastVerifiedAt: r.lastVerifiedAt } : {}),
    });
    // Domain audit payload, minus free text.
    const { reason: _reason, ...metadata } = r.audit.metadata;
    await t.audit.record({
      actorId: r.audit.actorId,
      action: r.audit.action,
      entityType: r.audit.entityType,
      entityId: r.audit.entityId,
      metadata: { ...metadata, reasonProvided: Boolean(input.reason) },
    });
    return { claimId: input.claimId, state: input.to };
  });
}
