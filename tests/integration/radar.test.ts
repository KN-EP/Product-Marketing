/**
 * M16 regulatory radar against a REAL Postgres (TEST_DATABASE_URL), simulated
 * LLM mode only: recording a change (source text, stale claims, impact), the
 * consequences (export blocked, launch readiness), the change brief run and
 * the resolution rules — plus tenant isolation of every new entry point.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { getAccessFallbackHTTPStatus, isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import type { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({}) as { userId?: string; tenantId?: string });
vi.mock("@/server/auth/session", () => ({
  getSession: async () => {
    const s = {
      userId: jar.userId,
      tenantId: jar.tenantId,
      async save() {
        jar.userId = s.userId;
        jar.tenantId = s.tenantId;
      },
      destroy() {
        delete jar.userId;
        delete jar.tenantId;
      },
    };
    return s;
  },
}));

import RadarPage from "@/app/(app)/radar/page";
import DemoPage from "@/app/(app)/demo/page";
import { recordRegulatoryChangeAction, resolveRegulatoryChangeAction } from "@/app/actions/radar";
import { exportMarkdownAction } from "@/app/actions/review";
import { DEMO_PREPARED_CHANGE } from "@/demo/regulatory-fixtures";
import { startWorkflowAction } from "@/app/actions/workflow";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { resetDemoData } from "@/server/demo/reset";
import { resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import { launchReadiness } from "@/server/launches/service";
import { recordRegulatoryChange, resolveRegulatoryChange } from "@/server/radar/service";
import { createDraftVersion, decideAsset, submitAssetForReview, transitionClaimState } from "@/server/review/service";
import { InProcessOrchestrator } from "@/server/workflow/orchestrator";
import { SEED_IDS, seed } from "../../prisma/seed";

const A = SEED_IDS[DEMO_TENANT_ID];
const B = SEED_IDS[OTHER_TENANT_ID];
const PASSWORD = randomBytes(18).toString("base64url");
const actor = (prefix: "usr_demo" | "usr_other", role: Role): Actor => ({
  kind: "human",
  userId: `${prefix}_${role}`,
  tenantId: prefix === "usr_demo" ? DEMO_TENANT_ID : OTHER_TENANT_ID,
  role,
});
const signInAs = (a: Actor) => {
  jar.userId = a.userId!;
  jar.tenantId = a.tenantId;
};
const EDITOR_A = actor("usr_demo", "editor");
const REVIEWER_A = actor("usr_demo", "reviewer");
const VIEWER_A: Actor = { ...EDITOR_A, role: "viewer" };
const EDITOR_B = actor("usr_other", "editor");
const REVIEWER_B = actor("usr_other", "reviewer");

const SEEDED_ASSETS = [A.asset, B.asset];
async function resetData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
  await db.regulatoryChange.deleteMany({ where: { tenantId: tenants } });
  // Restores the watched source text, the claim states and the watch deadline.
  await seed(db, { password: PASSWORD });
}

class Recording implements LlmProvider {
  readonly mode = "simulated" as const;
  readonly external = false;
  readonly modelId = "recording";
  readonly maxTokens = 0;
  readonly prompts: RenderedPrompt[] = [];
  private readonly sim = new SimulatedProvider();
  generate<S extends z.ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, opts: GenerateOptions): Promise<LlmResult<z.infer<S>>> {
    this.prompts.push(prompt);
    return this.sim.generate(spec, prompt, opts);
  }
}

const orchestrator = (provider: () => LlmProvider = () => new SimulatedProvider()) => new InProcessOrchestrator({ db: getDb(), provider });
async function runKind(input: Record<string, unknown>, provider?: () => LlmProvider, who: Actor = EDITOR_A) {
  const o = orchestrator(provider);
  const { run } = await o.start(who, { requestNonce: randomUUID(), ...input });
  const done = await o.execute(who, run.id);
  return { run: done, details: await o.get(who, run.id) };
}

type Outcome = { rendered: true } | { status: number };
async function render(page: () => Promise<unknown>): Promise<Outcome> {
  try {
    await page();
    return { rendered: true };
  } catch (e) {
    if (isHTTPAccessFallbackError(e)) return { status: getAccessFallbackHTTPStatus(e) };
    throw e;
  }
}

const record = (over: Record<string, unknown> = {}) => recordRegulatoryChangeAction({ ...DEMO_PREPARED_CHANGE, ...over });
const SRC = "src_demo_regulatory_summary";
const CLAIM = "clm_reg_high_risk_date";

beforeAll(async () => {
  await seed(getDb(), { password: PASSWORD });
});
afterAll(async () => {
  await resetData();
  await getDb().$disconnect();
});
beforeEach(async () => {
  resetRateLimits();
  delete jar.userId;
  delete jar.tenantId;
  await resetData();
});

/** An approved release plan whose v2 (human edit) relies on the deadline claim. */
async function approvedAssetUsingClaim() {
  const { details } = await runKind({ kind: "release_communication", releaseId: A.release });
  const out = details.outputs[0]!;
  const v1 = await getDb().assetVersion.findUniqueOrThrow({ where: { id: out.versionId } });
  const content = structuredClone(v1.content) as { summary: Record<string, unknown> };
  content.summary = { ...content.summary, text: "Plan the rollout before the high-risk obligations apply.", kind: "suggestion", claimIds: [CLAIM] };
  signInAs(REVIEWER_A);
  await decideAsset(REVIEWER_A, getDb(), { assetId: out.assetId, versionId: out.versionId, decision: "changes_requested", comment: "Use the deadline claim." });
  const v2 = await createDraftVersion(EDITOR_A, getDb(), { assetId: out.assetId, content });
  await submitAssetForReview(EDITOR_A, getDb(), out.assetId);
  await decideAsset(REVIEWER_A, getDb(), { assetId: out.assetId, versionId: v2.versionId, decision: "approved", expertReviewAcknowledged: true });
  return out.assetId;
}

describe("radar pages (M16)", () => {
  it("renders for editors and viewers; each tenant sees only its own watches; demo renders", async () => {
    for (const a of [EDITOR_A, VIEWER_A]) {
      signInAs(a);
      expect(await render(() => RadarPage())).toEqual({ rendered: true });
    }
    expect(await render(() => DemoPage())).toEqual({ rendered: true });
    expect((await tenantDb(EDITOR_A, getDb()).views.radar()).map((w) => w.id)).toEqual([A.watch]);
    expect((await tenantDb(EDITOR_B, getDb()).views.radar()).map((w) => w.id)).toEqual([B.watch]);
  });
});

describe("recording a change", () => {
  it("replaces the source text, marks the dependent claim stale, moves the deadline and stores the impact", async () => {
    const before = await getDb().source.findUniqueOrThrow({ where: { id: SRC } });
    signInAs(EDITOR_A);
    const res = await record();
    expect(res).toMatchObject({ ok: true });
    const { changeId, impact } = (res as { data: { changeId: string; impact: { staleClaimIds: string[] } } }).data;
    expect(impact.staleClaimIds).toEqual([CLAIM]);
    const src = await getDb().source.findUniqueOrThrow({ where: { id: SRC } });
    expect(src.content).toContain("postponed to 2 December 2027");
    expect(src.version).toBe(before.version + 1);
    expect(await getDb().claim.findUniqueOrThrow({ where: { id: CLAIM } })).toMatchObject({ state: "stale" });
    expect((await getDb().claim.findUniqueOrThrow({ where: { id: "clm_register" } })).state).toBe("approved");
    expect((await getDb().regulatoryWatch.findUniqueOrThrow({ where: { id: A.watch } })).currentDeadline?.toISOString().slice(0, 10)).toBe("2027-12-02");
    const change = await getDb().regulatoryChange.findUniqueOrThrow({ where: { id: changeId } });
    expect(change.previousDeadline?.toISOString().slice(0, 10)).toBe("2026-08-02");
    const audit = await getDb().auditEvent.findFirstOrThrow({ where: { entityType: "RegulatoryChange", entityId: changeId } });
    expect(audit).toMatchObject({ action: "regulatory.change_recorded", actorId: EDITOR_A.userId });
    expect(JSON.stringify(audit.metadata)).not.toContain("sixteen months");
    expect(await render(() => RadarPage())).toEqual({ rendered: true });
  });

  it("identical text → 409; a deadline shift without a date → 400; foreign watch → 404; injected key → 400; viewer 403; anonymous 401", async () => {
    const current = (await getDb().source.findUniqueOrThrow({ where: { id: SRC } })).content;
    signInAs(EDITOR_A);
    expect(await record({ updatedSourceText: current })).toMatchObject({ ok: false, status: 409, error: "no_change" });
    expect(await record({ newDeadline: "" })).toMatchObject({ ok: false, status: 400 });
    expect(await record({ watchId: B.watch })).toMatchObject({ ok: false, status: 404 });
    expect(await record({ tenantId: OTHER_TENANT_ID })).toMatchObject({ ok: false, status: 400 });
    await expect(recordRegulatoryChange(VIEWER_A, getDb(), DEMO_PREPARED_CHANGE)).rejects.toMatchObject({ status: 403 });
    delete jar.userId;
    delete jar.tenantId;
    expect(await record()).toMatchObject({ ok: false, status: 401 });
    expect(await getDb().regulatoryChange.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(0);
    expect((await getDb().source.findUniqueOrThrow({ where: { id: SRC } })).content).toBe(current);
  });
});

describe("consequences", () => {
  it("an approval that relies on the now-stale claim is flagged and can no longer be exported", async () => {
    const assetId = await approvedAssetUsingClaim();
    signInAs(EDITOR_A);
    expect(await exportMarkdownAction(assetId)).toMatchObject({ ok: true });
    const res = (await recordRegulatoryChange(EDITOR_A, getDb(), DEMO_PREPARED_CHANGE)) as { impact: { affectedAssets: { assetId: string; reasons: string[] }[] } };
    expect(res.impact.affectedAssets.find((a) => a.assetId === assetId)?.reasons).toContain("cites_stale_claim");
    expect(await exportMarkdownAction(assetId)).toMatchObject({ ok: false, status: 409, error: "approval_outdated" });
  });

  it("launch readiness of the affected product: every phase not ready while the alert is open", async () => {
    await recordRegulatoryChange(EDITOR_A, getDb(), DEMO_PREPARED_CHANGE);
    const { facts, readiness } = await launchReadiness(tenantDb(EDITOR_A, getDb()), A.launch);
    expect(facts).toMatchObject({ staleClaims: 1, openRegulatoryAlerts: 1 });
    expect(readiness.phases.every((p) => p.status === "no_go")).toBe(true);
    // The other tenant is untouched.
    const other = await launchReadiness(tenantDb(EDITOR_B, getDb()), B.launch);
    expect(other.facts.openRegulatoryAlerts).toBe(0);
  });
});

describe("change brief and resolution", () => {
  it("the change brief run cites the updated source, lists the impact and needs expert review", async () => {
    const { changeId } = await recordRegulatoryChange(EDITOR_A, getDb(), DEMO_PREPARED_CHANGE);
    const rec = new Recording();
    const { run, details } = await runKind({ kind: "regulatory_impact", changeId }, () => rec);
    expect(run).toMatchObject({ status: "completed", inputRefs: { changeId, watchId: A.watch } });
    expect(details.outputs).toEqual([expect.objectContaining({ assetType: "regulatory_change_brief", assetState: "pending_review", gatesPassed: true })]);
    expect(rec.prompts[0]!.user).toContain("previous_deadline: 2026-08-02");
    expect(rec.prompts[0]!.user).toContain(`stale_claims: ${CLAIM}`);
    const v = await getDb().assetVersion.findUniqueOrThrow({ where: { id: details.outputs[0]!.versionId } });
    expect((v.gateReport as { requiresExpertReview: boolean }).requiresExpertReview).toBe(true);
    signInAs(EDITOR_A);
    const foreign = await getDb().regulatoryChange.create({
      data: { tenantId: OTHER_TENANT_ID, watchId: B.watch, kind: "other", summary: "Isolation test change", previousContentHash: "a", newContentHash: "b", impact: { staleClaimIds: [], affectedAssets: [] }, recordedById: "usr_other_editor" },
    });
    expect(await startWorkflowAction({ kind: "regulatory_impact", changeId: foreign.id, requestNonce: randomUUID() })).toMatchObject({ ok: false, status: 404 });
    signInAs(REVIEWER_A);
    expect(await resolveRegulatoryChangeAction({ changeId: foreign.id, note: "cross-tenant attempt" })).toMatchObject({ ok: false, status: 404 });
  });

  it("resolution is refused while the claim is stale; after retiring it the alert resolves and readiness recovers", async () => {
    const { changeId } = await recordRegulatoryChange(EDITOR_A, getDb(), DEMO_PREPARED_CHANGE);
    signInAs(REVIEWER_A);
    expect(await resolveRegulatoryChangeAction({ changeId, note: "Messaging re-reviewed." })).toMatchObject({ ok: false, status: 409, error: "claims_still_stale" });
    await expect(resolveRegulatoryChange(EDITOR_A, getDb(), { changeId, note: "Editors cannot resolve." })).rejects.toMatchObject({ status: 403 });
    await transitionClaimState(EDITOR_A, getDb(), { claimId: CLAIM, to: "draft", reason: "Deadline moved; claim retired." });
    expect(await resolveRegulatoryChangeAction({ changeId, note: "Claim retired, messaging re-reviewed." })).toMatchObject({ ok: true });
    expect(await resolveRegulatoryChangeAction({ changeId, note: "Second attempt to resolve." })).toMatchObject({ ok: false, status: 409, error: "already_resolved" });
    const { facts } = await launchReadiness(tenantDb(EDITOR_A, getDb()), A.launch);
    expect(facts).toMatchObject({ staleClaims: 0, openRegulatoryAlerts: 0 });
  });
});

describe("demo reset", () => {
  it("removes changes and watches; the seed restores the source text, the claim and the deadline", async () => {
    await recordRegulatoryChange(EDITOR_A, getDb(), DEMO_PREPARED_CHANGE);
    const counts = await resetDemoData(getDb());
    expect(counts.regulatoryChanges).toBe(1);
    expect(await getDb().regulatoryWatch.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(0);
    await seed(getDb(), { password: PASSWORD });
    expect((await getDb().source.findUniqueOrThrow({ where: { id: SRC } })).content).toContain("apply from 2 August 2026");
    expect((await getDb().claim.findUniqueOrThrow({ where: { id: CLAIM } })).state).toBe("approved");
    expect((await getDb().regulatoryWatch.findUniqueOrThrow({ where: { id: A.watch } })).currentDeadline?.toISOString().slice(0, 10)).toBe("2026-08-02");
  });
});
