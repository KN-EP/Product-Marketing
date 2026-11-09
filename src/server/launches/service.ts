import { canReview, hasRole, type Actor } from "../../domain/actor";
import {
  computeReadiness,
  failedRecommended,
  failedRequired,
  LaunchDecisionInput,
  LaunchInput,
  LaunchProofInput,
  PHASE_DATE_FIELD,
  PHASE_LABEL,
} from "../../domain/launches/launch";
import { LAUNCH_PHASES } from "../../domain/schemas/launch";
import type { Db } from "../db/client";
import { tenantDb, withTenantTx, type TenantDb } from "../db/tenant-scope";
import { HttpError } from "../errors";

const day = (d: string | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, raw: unknown, what: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "invalid_input", `Invalid ${what}.`, r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

/**
 * Creates a launch briefing (M15, station "Launch"). Editors only; tenant from
 * the actor; product and release ids resolved through the tenant-scoped DAL
 * (404 on a foreign id); the release must belong to the same product.
 */
export async function createLaunch(actor: Actor, db: Db, raw: unknown): Promise<{ launchId: string }> {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
  const l = parse(LaunchInput, raw, "launch");
  return withTenantTx(actor, db, async (t) => {
    const product = await t.products.getById(l.productId);
    const release = l.releaseId ? await t.releases.getById(l.releaseId) : null;
    if (release && release.product.id !== product.id) throw new HttpError(400, "invalid_input", "The release belongs to another product.");
    const { id } = await t.launches.create({
      productId: product.id,
      releaseId: release?.id ?? null,
      name: l.name,
      tier: l.tier,
      summary: l.summary,
      pricingModel: l.pricingModel,
      targetSegments: l.targetSegments,
      earlyAccessOn: day(l.earlyAccessOn),
      generalAvailabilityOn: day(l.generalAvailabilityOn),
      customerLaunchOn: day(l.customerLaunchOn),
      marketLaunchOn: day(l.marketLaunchOn),
      externalReferences: l.externalReferences,
      internalPilot: l.internalPilot,
    });
    await t.audit.record({
      actorId: actor.userId,
      action: "launch.created",
      entityType: "Launch",
      entityId: id,
      metadata: { productId: product.id, releaseId: release?.id ?? null, tier: l.tier, phases: LAUNCH_PHASES.filter((p) => l[PHASE_DATE_FIELD[p]]) },
    });
    return { launchId: id };
  });
}

/** Proof grows during a launch (references, documented internal pilot). Editors; audited with the numbers. */
export async function updateLaunchProof(actor: Actor, db: Db, raw: unknown): Promise<{ launchId: string }> {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
  const p = parse(LaunchProofInput, raw, "proof");
  return withTenantTx(actor, db, async (t) => {
    const launch = await t.launches.getById(p.launchId);
    await t.launches.updateProof(launch.id, { externalReferences: p.externalReferences, internalPilot: p.internalPilot });
    await t.audit.record({
      actorId: actor.userId,
      action: "launch.proof_updated",
      entityType: "Launch",
      entityId: launch.id,
      metadata: { from: { externalReferences: launch.externalReferences, internalPilot: launch.internalPilot }, to: { externalReferences: p.externalReferences, internalPilot: p.internalPilot } },
    });
    return { launchId: launch.id };
  });
}

/** Current readiness of a launch (same computation the plan and the decision use). */
export async function launchReadiness(tdb: TenantDb, launchId: string) {
  const launch = await tdb.launches.getById(launchId);
  const facts = await tdb.launches.facts({
    id: launch.id,
    productId: launch.product.id,
    releaseId: launch.release?.id ?? null,
    externalReferences: launch.externalReferences,
    internalPilot: launch.internalPilot,
  });
  return { launch, facts, readiness: computeReadiness(launch, facts) };
}

/**
 * Go / no-go for one phase (M15). Human reviewers only. Readiness is
 * recomputed now, not trusted from the page:
 * - "go" is refused (409 readiness_no_go, audited) while a REQUIRED check fails;
 * - "go" with failed recommended checks needs risksAcknowledged + a comment (422);
 * - "go" needs a "go" for every earlier phase that has a date (409 phase_order);
 * - "no_go" always needs a comment.
 * The decision is stored with the readiness snapshot it was based on.
 */
export async function decideLaunchPhase(actor: Actor, db: Db, raw: unknown): Promise<{ decisionId: string; status: string }> {
  if (!canReview(actor)) throw new HttpError(403, "forbidden", "Only a human reviewer can decide go / no-go.");
  const d = parse(LaunchDecisionInput, raw, "decision");
  const comment = d.comment?.trim() || null;
  try {
    return await withTenantTx(actor, db, async (t) => {
      const { launch, readiness } = await launchReadiness(t, d.launchId);
      const phase = readiness.phases.find((p) => p.phase === d.phase)!;
      if (d.decision === "no_go") {
        if (!comment || comment.length < 10) throw new HttpError(422, "comment_required", "Explain the no-go decision (at least 10 characters).");
      } else {
        if (phase.status === "no_go") {
          throw new HttpError(409, "readiness_no_go", `${PHASE_LABEL[d.phase]} is not ready: ${failedRequired(phase).map((c) => c.label).join("; ")}.`);
        }
        if (phase.status === "go_with_risks" && (!d.risksAcknowledged || !comment || comment.length < 10)) {
          throw new HttpError(
            422,
            "risk_ack_required",
            `Acknowledge the open risks and explain why: ${failedRecommended(phase).map((c) => c.label).join("; ")}.`,
          );
        }
        const latest = new Map<string, string>();
        for (const x of await t.launches.decisions(launch.id)) if (!latest.has(x.phase)) latest.set(x.phase, x.decision);
        const earlier = readiness.phases.filter((p) => LAUNCH_PHASES.indexOf(p.phase) < LAUNCH_PHASES.indexOf(d.phase) && p.plannedOn);
        const missing = earlier.filter((p) => latest.get(p.phase) !== "go");
        if (missing.length) {
          throw new HttpError(409, "phase_order", `Decide go for the earlier phase(s) first: ${missing.map((p) => PHASE_LABEL[p.phase]).join(", ")}.`);
        }
      }
      const { id } = await t.launches.recordDecision({ launchId: launch.id, phase: d.phase, decision: d.decision, comment, readiness: phase, decidedById: actor.userId! });
      await t.audit.record({
        actorId: actor.userId,
        action: `launch.decision.${d.decision}`,
        entityType: "Launch",
        entityId: launch.id,
        metadata: { decisionId: id, phase: d.phase, readiness: phase.status, risksAcknowledged: Boolean(d.risksAcknowledged), hasComment: Boolean(comment) },
      });
      return { decisionId: id, status: phase.status };
    });
  } catch (e) {
    if (e instanceof HttpError && e.code === "readiness_no_go") {
      await tenantDb(actor, db).audit.record({
        actorId: actor.userId,
        action: "launch.go_blocked",
        entityType: "Launch",
        entityId: d.launchId,
        metadata: { phase: d.phase, reason: e.code },
      });
    }
    throw e;
  }
}
