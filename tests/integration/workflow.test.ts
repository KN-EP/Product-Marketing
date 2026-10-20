/**
 * M5 — workflow engine + review persistence against a REAL Postgres
 * (TEST_DATABASE_URL), simulated LLM mode only. Only the cookie layer is
 * replaced by an in-memory session; DAL, orchestrator, routes and server
 * actions run for real.
 */
import { randomBytes, randomUUID } from "node:crypto";
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

import {
  createDraftVersionAction,
  decideAction,
  exportMarkdownAction,
  submitForReviewAction,
  transitionClaimAction,
} from "@/app/actions/review";
import { retryWorkflowRunAction } from "@/app/actions/workflow";
import { GET as getRunRoute } from "@/app/api/workflows/[id]/route";
import { POST as startRunRoute } from "@/app/api/workflows/route";
import {
  DEMO_TENANT_ID,
  OTHER_TENANT_ID,
  SIMULATED_BATTLECARD_CORRECTED,
  SIMULATED_BATTLECARD_FLAWED,
} from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { resetRateLimits } from "@/server/http/rate-limit";
import { tenantDb } from "@/server/db/tenant-scope";
import { LlmOutputInvalidError } from "@/server/llm/errors";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { LlmProvider } from "@/server/llm/types";
import { InProcessOrchestrator } from "@/server/workflow/orchestrator";
import { SEED_IDS, seed } from "../../prisma/seed";

const A = SEED_IDS[DEMO_TENANT_ID];
const B = SEED_IDS[OTHER_TENANT_ID];
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
const ADMIN_B = actor("usr_other", "admin");

const runInput = (nonce: string = randomUUID()) => ({
  productId: A.product,
  personaId: A.persona,
  market: "DACH mid-market",
  regulatoryTriggerId: A.regulatoryTrigger,
  competitorIds: [...A.competitors],
  requestNonce: nonce,
});

const orchestrator = (provider: () => LlmProvider = () => new SimulatedProvider()) =>
  new InProcessOrchestrator({ db: getDb(), provider });

/** Seeded assets survive; everything created by workflow/review tests is removed (TEST DB only). */
const SEEDED_ASSETS = [A.asset, B.asset];
async function resetWorkflowData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
}

async function runToCompletion(provider?: () => LlmProvider) {
  const o = orchestrator(provider);
  const { run } = await o.start(EDITOR_A, runInput());
  const done = await o.execute(EDITOR_A, run.id);
  return { o, run: done, details: await o.get(EDITOR_A, run.id) };
}

const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });
const postRun = (body: unknown) =>
  startRunRoute(new Request("http://localhost/api/workflows", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const getRun = (id: string) => getRunRoute(new Request(`http://localhost/api/workflows/${id}`), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  await seed(getDb(), { password: randomBytes(18).toString("base64url") });
  await resetWorkflowData();
});

afterAll(async () => {
  await resetWorkflowData();
  await getDb().$disconnect();
});

beforeEach(async () => {
  resetRateLimits();
  delete jar.userId;
  delete jar.tenantId;
  await resetWorkflowData();
});

describe("full run (simulated)", () => {
  it("creates 3 deliverables in pending_review + the internal input brief (draft); run completed ≠ approved", async () => {
    const { run, details } = await runToCompletion();
    expect(run).toMatchObject({ status: "completed", generationMode: "simulated", attempts: 1, error: null, costEstimateUsd: 0 });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(run.promptVersions).toMatchObject({ "agent-a.product-intelligence": "1.0.0", "agent-c.battlecard": "1.1.0" });
    expect(run.inputRefs).toMatchObject({ productId: A.product, competitorIds: A.competitors });
    expect(run.inputRefs).not.toHaveProperty("requestNonce");

    expect(details.outputs.map((o) => o.assetType).sort()).toEqual([
      "competitive_battlecard",
      "messaging_framework",
      "product_intelligence_brief",
      "regulatory_gtm_brief",
    ]);
    const deliverables = details.outputs.filter((o) => !o.internal);
    expect(deliverables.map((o) => o.assetType).sort()).toEqual(["competitive_battlecard", "messaging_framework", "regulatory_gtm_brief"]);
    expect(deliverables.every((o) => o.assetState === "pending_review")).toBe(true);
    // Agent A brief: stored for traceability, never enters review.
    expect(details.outputs.filter((o) => o.internal)).toEqual([expect.objectContaining({ assetType: "product_intelligence_brief", assetState: "draft" })]);
    expect(details.history.map((h) => h.action)).toEqual([
      "workflow.created",
      "workflow.queued",
      "workflow.running",
      "workflow.validation",
      "workflow.pending_review",
      "workflow.completed",
    ]);

    const tdb = tenantDb(EDITOR_A, getDb());
    for (const o of details.outputs) {
      const rec = await tdb.assets.getRecord(o.assetId);
      expect(rec.versions).toHaveLength(1);
      expect(rec.versions[0]!.gateReport.gateVersion).toBe("gates.v1");
      expect(rec.approvals).toHaveLength(0);
      expect(rec.state).not.toBe("approved");
    }
  });

  it("repeating the request returns the existing run and creates no duplicate assets", async () => {
    const o = orchestrator();
    const input = runInput("fixed-nonce");
    const first = await o.start(EDITOR_A, input);
    await o.execute(EDITOR_A, first.run.id);
    const assetsBefore = await getDb().asset.count({ where: { tenantId: DEMO_TENANT_ID } });

    const again = await o.start(EDITOR_A, input);
    expect(again.created).toBe(false);
    expect(again.run.id).toBe(first.run.id);
    expect(await getDb().asset.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(assetsBefore);
    await expect(o.execute(EDITOR_A, first.run.id)).rejects.toMatchObject({ status: 409 });
  });

  it("POST /api/workflows → 202, runs in background, GET shows completed; repeat → 200 same run", async () => {
    signInAs(EDITOR_A);
    const input = runInput();
    const res = await json(await postRun(input));
    expect(res.status).toBe(202);
    const runId = (res.body.run as { id: string }).id;

    let status = "";
    for (let i = 0; i < 60 && status !== "completed" && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = ((await json(await getRun(runId))).body.run as { status: string }).status;
    }
    expect(status).toBe("completed");
    const details = await json(await getRun(runId));
    expect((details.body.outputs as { internal: boolean }[]).filter((o) => !o.internal)).toHaveLength(3);

    const repeat = await json(await postRun(input));
    expect(repeat.status).toBe(200);
    expect((repeat.body.run as { id: string }).id).toBe(runId);
  });

  it("rejects invalid input (incl. an injected tenantId) with 400 and non-editors with 403", async () => {
    signInAs(EDITOR_A);
    expect((await postRun({ ...runInput(), tenantId: OTHER_TENANT_ID })).status).toBe(400);
    expect((await postRun({ ...runInput(), competitorIds: ["cmp_a"] })).status).toBe(400);
    const notJson = await startRunRoute(new Request("http://localhost/api/workflows", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);
    const big = await startRunRoute(new Request("http://localhost/api/workflows", { method: "POST", body: "x".repeat(20_000) }));
    expect(big.status).toBe(413);
  });
});

describe("limits and failures", () => {
  it("concurrency: a third active run in the tenant is rejected with 429", async () => {
    signInAs(EDITOR_A);
    const o = orchestrator();
    await o.start(EDITOR_A, runInput());
    await o.start(EDITOR_A, runInput());
    const res = await postRun(runInput());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("concurrency_limit");
  });

  it("failed run: status failed, sanitized error, no assets; explicit retry completes it", async () => {
    const sim = new SimulatedProvider();
    const failing: LlmProvider = {
      mode: "simulated",
      external: false,
      modelId: sim.modelId,
      maxTokens: 0,
      generate: (spec, prompt, opts) =>
        spec.assetType === "messaging_framework"
          ? Promise.reject(new LlmOutputInvalidError("Model output for messaging_framework failed schema validation.", [{ path: "pillars", message: "x" }]))
          : sim.generate(spec, prompt, opts),
    };
    let provider: LlmProvider = failing;
    const o = orchestrator(() => provider);
    const { run } = await o.start(EDITOR_A, runInput());
    const failed = await o.execute(EDITOR_A, run.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/^output_invalid: .*Invalid fields: pillars$/);
    expect(failed.attempts).toBe(1);
    expect((await o.get(EDITOR_A, run.id)).outputs).toHaveLength(0);
    expect(await getDb().asset.count({ where: { tenantId: DEMO_TENANT_ID, id: { notIn: SEEDED_ASSETS } } })).toBe(0);

    // Retry is explicit; nothing re-runs by itself.
    expect((await o.get(EDITOR_A, run.id)).run.status).toBe("failed");
    provider = new SimulatedProvider();
    const queued = await o.retry(EDITOR_A, run.id);
    expect(queued.status).toBe("queued");
    const done = await o.execute(EDITOR_A, run.id);
    expect(done).toMatchObject({ status: "completed", attempts: 2, error: null });
    expect((await o.get(EDITOR_A, run.id)).outputs).toHaveLength(4);
    await expect(o.retry(EDITOR_A, run.id)).rejects.toMatchObject({ limit: "max_attempts" });
  });

  it("max attempts: after 3 failed attempts retry is refused", async () => {
    const boom: LlmProvider = { mode: "simulated", external: false, modelId: "x", maxTokens: 0, generate: () => Promise.reject(new Error("boom: secret detail")) };
    const o = orchestrator(() => boom);
    const { run } = await o.start(EDITOR_A, runInput());
    for (let i = 0; i < 3; i++) {
      if (i > 0) await o.retry(EDITOR_A, run.id);
      const r = await o.execute(EDITOR_A, run.id);
      expect(r.status).toBe("failed");
      expect(r.error).toBe("internal_error: The run failed unexpectedly. See server logs.");
    }
    signInAs(EDITOR_A);
    const res = await retryWorkflowRunAction(run.id);
    expect(res).toMatchObject({ ok: false, status: 409, error: "max_attempts" });
  });
});

describe("review persistence (acceptance E, F, G)", () => {
  async function flawedBattlecard() {
    const { details } = await runToCompletion(() => new SimulatedProvider({ competitive_battlecard: SIMULATED_BATTLECARD_FLAWED }));
    const bc = details.outputs.find((o) => o.assetType === "competitive_battlecard")!;
    expect(bc.gatesPassed).toBe(false);
    return bc;
  }

  it("E: the flawed battlecard v1 fails gates and cannot be approved (blocked attempt is audited)", async () => {
    const bc = await flawedBattlecard();
    signInAs(REVIEWER_A);
    const res = await decideAction({ assetId: bc.assetId, versionId: bc.versionId, decision: "approved" });
    expect(res).toMatchObject({ ok: false, status: 422, error: "gates_failed" });
    const rec = await tenantDb(REVIEWER_A, getDb()).assets.getRecord(bc.assetId);
    expect(rec.state).toBe("pending_review");
    expect(rec.approvals).toHaveLength(0);
    const audit = await tenantDb(REVIEWER_A, getDb()).audit.listFor("Asset", bc.assetId);
    expect(audit.map((a) => a.action)).toContain("asset.approval_blocked");
  });

  it("F: reject → changes_requested → new version → approve; v1 row never changes; G: export", async () => {
    const bc = await flawedBattlecard();
    const db = getDb();
    const v1Before = await db.assetVersion.findUniqueOrThrow({ where: { id: bc.versionId } });

    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: bc.assetId, versionId: bc.versionId, decision: "rejected", comment: "Unsupported comparison" })).toMatchObject({
      ok: true,
      data: { state: "draft" },
    });
    signInAs(EDITOR_A);
    expect(await submitForReviewAction(bc.assetId)).toMatchObject({ ok: true, data: { state: "pending_review" } });
    signInAs(REVIEWER_A);
    expect(
      await decideAction({ assetId: bc.assetId, versionId: bc.versionId, decision: "changes_requested", comment: "Use approved competitor evidence" }),
    ).toMatchObject({ ok: true, data: { state: "changes_requested" } });

    signInAs(EDITOR_A);
    const draft = await createDraftVersionAction(bc.assetId, SIMULATED_BATTLECARD_CORRECTED);
    expect(draft).toMatchObject({ ok: true, data: { versionNumber: 2, gatesPassed: true, state: "draft" } });
    const v2 = (draft as { data: { versionId: string } }).data.versionId;
    expect(await submitForReviewAction(bc.assetId)).toMatchObject({ ok: true });

    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: bc.assetId, versionId: bc.versionId, decision: "approved" })).toMatchObject({
      ok: false,
      status: 409,
      error: "not_current_version",
    });
    expect(await decideAction({ assetId: bc.assetId, versionId: v2, decision: "approved" })).toMatchObject({ ok: true, data: { state: "approved" } });

    const rec = await tenantDb(REVIEWER_A, db).assets.getRecord(bc.assetId);
    expect(rec.approvals.map((a) => a.decision)).toEqual(["rejected", "changes_requested", "approved"]);
    expect(await db.assetVersion.findUniqueOrThrow({ where: { id: bc.versionId } })).toEqual(v1Before);

    const audit = await tenantDb(REVIEWER_A, db).audit.listFor("Asset", bc.assetId);
    expect(audit.map((a) => a.action)).toEqual([
      "asset.version_created",
      "asset.pending_review",
      "asset.decision.rejected",
      "asset.pending_review",
      "asset.decision.changes_requested",
      "asset.version_created",
      "asset.pending_review",
      "asset.decision.approved",
    ]);
    expect(JSON.stringify(audit)).not.toContain("Unsupported comparison");

    // G — export of the approved version.
    const exp = await exportMarkdownAction(bc.assetId);
    expect(exp.ok).toBe(true);
    const md = (exp as { data: { markdown: string } }).data.markdown;
    expect(md).toContain(`| Version | v2 (${v2}) |`);
    expect(md).toContain("[SYNTHETIC] DataGuard Demo – Unofficial reviewer");
    expect(md).toContain("## Sources");
    expect(md).toContain("`src_demo_competitor_a`");
    expect(md).toContain("competitor-evidence:cev_a_no_register");
    expect((await tenantDb(REVIEWER_A, db).audit.listFor("Asset", bc.assetId)).at(-1)?.action).toBe("asset.exported");
  });

  it("export refuses assets without an approved version", async () => {
    const { details } = await runToCompletion();
    signInAs(REVIEWER_A);
    const mf = details.outputs.find((o) => o.assetType === "messaging_framework")!;
    expect(await exportMarkdownAction(mf.assetId)).toMatchObject({ ok: false, status: 409, error: "not_approved" });
  });

  it("claim decisions go through the domain and are audited", async () => {
    signInAs(REVIEWER_A);
    // No evidence → cannot be approved.
    expect(await transitionClaimAction({ claimId: "clm_automated_classification", to: "approved" })).toMatchObject({
      ok: false,
      status: 422,
      error: "insufficient_evidence",
    });
    expect(await transitionClaimAction({ claimId: "clm_automated_classification", to: "rejected", reason: "No evidence" })).toMatchObject({
      ok: true,
      data: { state: "rejected" },
    });
    const audit = await tenantDb(REVIEWER_A, getDb()).audit.listFor("Claim", "clm_automated_classification");
    expect(audit.at(-1)).toMatchObject({ action: "claim.rejected", metadata: { from: "pending_review", to: "rejected", reasonProvided: true } });
    expect(JSON.stringify(audit.at(-1))).not.toContain("No evidence");
    // restore seed state for other tests
    await getDb().claim.update({ where: { id: "clm_automated_classification" }, data: { state: "pending_review" } });
  });
});

describe("cross-tenant: tenant-B user gets 404 for tenant-A runs, assets, claims and actions", () => {
  it("routes and actions", async () => {
    const { run, details } = await runToCompletion();
    const target = details.outputs.find((o) => !o.internal)!;
    const assetId = target.assetId;
    const versionId = target.versionId;

    signInAs(ADMIN_B);
    expect((await getRun(run.id)).status).toBe(404);
    expect((await postRun(runInput())).status).toBe(404); // A's product/persona/trigger/competitor ids
    expect((await postRun({ ...runInput(), productId: B.product, personaId: B.persona, regulatoryTriggerId: B.regulatoryTrigger })).status).toBe(404); // A's competitors

    const notFound = { ok: false, status: 404, error: "not_found" };
    expect(await retryWorkflowRunAction(run.id)).toEqual(notFound);
    expect(await submitForReviewAction(assetId)).toEqual(notFound);
    expect(await decideAction({ assetId, versionId, decision: "approved" })).toEqual(notFound);
    expect(await createDraftVersionAction(assetId, SIMULATED_BATTLECARD_CORRECTED)).toEqual(notFound);
    expect(await exportMarkdownAction(assetId)).toEqual(notFound);
    expect(await transitionClaimAction({ claimId: A.claim, to: "draft" })).toEqual(notFound);

    // Missing ids look the same as foreign ids.
    expect((await getRun("does_not_exist")).status).toBe(404);
    expect(await submitForReviewAction("does_not_exist")).toEqual(notFound);

    // Nothing changed in tenant A.
    const rec = await tenantDb(EDITOR_A, getDb()).assets.getRecord(assetId);
    expect(rec.state).toBe("pending_review");
    expect(rec.versions).toHaveLength(1);

    // Positive controls: tenant A sees its run; tenant B can start a run with its own ids.
    signInAs(EDITOR_A);
    expect((await getRun(run.id)).status).toBe(200);
    const bRun = await orchestrator().start(actor("usr_other", "editor"), {
      productId: B.product,
      personaId: B.persona,
      market: "Synthetic",
      regulatoryTriggerId: B.regulatoryTrigger,
      competitorIds: [...B.competitors],
      requestNonce: randomUUID(),
    });
    expect(bRun.created).toBe(true);
    signInAs(EDITOR_A);
    expect((await getRun(bRun.run.id)).status).toBe(404);
  });

  it("unauthenticated: 401 on routes and actions", async () => {
    expect((await getRun("anything")).status).toBe(401);
    expect((await postRun(runInput())).status).toBe(401);
    expect(await submitForReviewAction("anything")).toMatchObject({ ok: false, status: 401 });
  });
});
