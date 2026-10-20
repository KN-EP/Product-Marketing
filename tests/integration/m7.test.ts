/**
 * M7 integration tests (real test DB, simulated mode): internal input brief
 * (A1), demo reset (B8), automatic stale-run sweep (C9), rate limits (C10).
 */
import { spawnSync } from "node:child_process";
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

import ProductPage from "@/app/(app)/products/[id]/page";
import WorkflowRunPage from "@/app/(app)/workflows/[id]/page";
import { loginAction } from "@/app/actions/auth";
import { createDraftVersionAction, decideAction, exportMarkdownAction, submitForReviewAction } from "@/app/actions/review";
import { POST as startRunRoute } from "@/app/api/workflows/route";
import { DEMO_TENANT_ID, OTHER_TENANT_ID, SIMULATED_PRODUCT_INTELLIGENCE_BRIEF } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { DemoResetRefused, resetDemoData } from "@/server/demo/reset";
import { RATE_LIMITS, resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import { InProcessOrchestrator, STALE_AUTO_ERROR } from "@/server/workflow/orchestrator";
import { SEED_IDS, seed, seedUserEmail } from "../../prisma/seed";

const A = SEED_IDS[DEMO_TENANT_ID];
const PASSWORD = randomBytes(18).toString("base64url");
const actor = (prefix: "usr_demo" | "usr_other", role: Role): Actor => ({
  kind: "human",
  userId: `${prefix}_${role}`,
  tenantId: prefix === "usr_demo" ? DEMO_TENANT_ID : OTHER_TENANT_ID,
  role,
});
const EDITOR_A = actor("usr_demo", "editor");
const REVIEWER_A = actor("usr_demo", "reviewer");
const signInAs = (a: Actor) => {
  jar.userId = a.userId!;
  jar.tenantId = a.tenantId;
};
const runInput = () => ({
  productId: A.product,
  personaId: A.persona,
  market: "Germany",
  regulatoryTriggerId: A.regulatoryTrigger,
  competitorIds: [...A.competitors],
  requestNonce: randomUUID(),
});
const orchestrator = () => new InProcessOrchestrator({ db: getDb(), provider: () => new SimulatedProvider() });
async function completedRun() {
  const o = orchestrator();
  const { run } = await o.start(EDITOR_A, runInput());
  await o.execute(EDITOR_A, run.id);
  return o.get(EDITOR_A, run.id);
}
const p = (id: string) => ({ params: Promise.resolve({ id }) });

const NON_DEMO = { id: "tnt_it_nondemo", slug: "it-nondemo" };

beforeAll(async () => {
  await seed(getDb(), { password: PASSWORD });
  await resetDemoData(getDb());
  await seed(getDb(), { password: PASSWORD });
});
afterAll(async () => {
  await getDb().tenant.deleteMany({ where: { id: NON_DEMO.id } });
  await resetDemoData(getDb());
  await seed(getDb(), { password: PASSWORD });
  await getDb().$disconnect();
});
beforeEach(() => {
  delete jar.userId;
  delete jar.tenantId;
  resetRateLimits();
});

describe("A1 — Agent A input brief is internal", () => {
  it("is stored as an internal draft, excluded from queue/lists/counts, shown on run + product page", async () => {
    const details = await completedRun();
    const brief = details.outputs.find((o) => o.internal)!;
    expect(brief).toMatchObject({ assetType: "product_intelligence_brief", assetState: "draft" });
    expect(brief.title).toContain("Input brief (internal — not for external use)");

    const tdb = tenantDb(EDITOR_A, getDb());
    const queue = await tdb.views.reviewQueue();
    expect(queue.some((a) => a.type === "product_intelligence_brief")).toBe(false);
    expect(queue).toHaveLength(4); // 3 deliverables + the seeded messaging framework
    expect((await tdb.views.assets()).some((a) => a.type === "product_intelligence_brief")).toBe(false);
    expect((await tdb.counts()).assets).toBe(4); // 3 deliverables + 1 seeded asset; brief not counted
    expect((await tdb.views.demoProgress()).assetsPending).toBe(4);

    const shown = await tdb.views.inputBriefForProduct(A.product);
    expect(shown?.asset.id).toBe(brief.assetId);
    expect(shown?.content).toMatchObject({ missingEvidence: SIMULATED_PRODUCT_INTELLIGENCE_BRIEF.missingEvidence });

    signInAs(EDITOR_A);
    await expect(ProductPage(p(A.product))).resolves.toBeTruthy();
    await expect(WorkflowRunPage(p(details.run.id))).resolves.toBeTruthy();
  });

  it("cannot be submitted, decided, edited or exported", async () => {
    const brief = (await completedRun()).outputs.find((o) => o.internal)!;
    const internal = { ok: false, status: 409, error: "internal_input" };
    signInAs(EDITOR_A);
    expect(await submitForReviewAction(brief.assetId)).toMatchObject(internal);
    expect(await createDraftVersionAction(brief.assetId, SIMULATED_PRODUCT_INTELLIGENCE_BRIEF)).toMatchObject(internal);
    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: brief.assetId, versionId: brief.versionId, decision: "approved" })).toMatchObject(internal);
    expect(await exportMarkdownAction(brief.assetId)).toMatchObject(internal);
  });
});

describe("B8 — demo reset", () => {
  it("deletes runs, assets, versions, approvals and their audit events for demo tenants only; re-seed restores", async () => {
    const db = getDb();
    await db.tenant.upsert({ where: { id: NON_DEMO.id }, create: { ...NON_DEMO, name: "IT non-demo tenant", isDemo: false }, update: { isDemo: false } });
    await db.asset.upsert({
      where: { id: "ast_it_nondemo" },
      create: { id: "ast_it_nondemo", tenantId: NON_DEMO.id, type: "messaging_framework", title: "kept" },
      update: {},
    });
    const details = await completedRun();
    const mf = details.outputs.find((o) => o.assetType === "messaging_framework")!;
    signInAs(REVIEWER_A);
    await decideAction({ assetId: mf.assetId, versionId: mf.versionId, decision: "rejected", comment: "x" });

    const counts = await resetDemoData(db);
    expect(counts.tenants.sort()).toEqual(["dataguard-demo", "other-demo"]);
    expect(counts.workflowRuns).toBeGreaterThanOrEqual(1);
    expect(counts.assets).toBeGreaterThanOrEqual(4);
    expect(counts.approvals).toBeGreaterThanOrEqual(1);
    expect(counts.auditEvents).toBeGreaterThan(0);

    const demoTenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
    expect(await db.workflowRun.count({ where: { tenantId: demoTenants } })).toBe(0);
    expect(await db.asset.count({ where: { tenantId: demoTenants } })).toBe(0);
    expect(await db.auditEvent.count({ where: { tenantId: demoTenants, entityType: { in: ["Asset", "WorkflowRun"] } } })).toBe(0);
    expect(await db.asset.count({ where: { tenantId: NON_DEMO.id } })).toBe(1); // non-demo tenant untouched

    await seed(db, { password: PASSWORD });
    expect(await db.asset.findUnique({ where: { id: A.asset } })).not.toBeNull();
  });

  it("refuses a non-demo tenant and NODE_ENV=production", async () => {
    await getDb().tenant.upsert({ where: { id: NON_DEMO.id }, create: { ...NON_DEMO, name: "IT non-demo tenant", isDemo: false }, update: { isDemo: false } });
    await expect(resetDemoData(getDb(), { tenantSlugs: [NON_DEMO.slug] })).rejects.toBeInstanceOf(DemoResetRefused);
    await expect(resetDemoData(getDb(), { tenantSlugs: ["dataguard-demo", NON_DEMO.slug] })).rejects.toThrow(/not a demo tenant/);
    await expect(resetDemoData(getDb(), { env: { NODE_ENV: "production" } })).rejects.toThrow(/production/);
  });

  it("the npm script refuses in production before connecting and prints no connection string", () => {
    const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/demo-reset.ts"], {
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Refusing to reset demo data when NODE_ENV=production.");
    expect(r.stdout + r.stderr).not.toMatch(/postgres(ql)?:\/\//);
  });
});

describe("C9 — stale runs are failed automatically on the next workflow request", () => {
  it("an active run without progress for >10 min is failed with a sanitized error; fresh runs are not touched", async () => {
    const o = orchestrator();
    const stale = (await o.start(EDITOR_A, runInput())).run;
    await getDb().workflowRun.update({ where: { id: stale.id }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
    const fresh = (await o.start(EDITOR_A, runInput())).run; // this request sweeps
    const s = await o.get(EDITOR_A, stale.id);
    expect(s.run).toMatchObject({ status: "failed", error: STALE_AUTO_ERROR });
    expect(s.history.at(-1)).toMatchObject({ action: "workflow.failed", metadata: { stale: true, automatic: true } });
    expect((await o.get(EDITOR_A, fresh.id)).run.status).toBe("queued");
    // the freed slot can be used and the stale run retried explicitly
    expect((await o.retry(EDITOR_A, stale.id)).status).toBe("queued");
  });
});

describe("C10 — rate limits", () => {
  it("login: after the limit even the correct password is refused", async () => {
    const email = "nobody@other-demo.example"; // unknown user: attempts still count
    for (let i = 0; i < RATE_LIMITS.login.limit; i++) {
      expect(await loginAction({}, form({ email, password: "wrong-password" }))).toEqual({ error: "Invalid e-mail or password." });
    }
    expect(await loginAction({}, form({ email, password: PASSWORD }))).toEqual({
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    });
    resetRateLimits();
    const ok = await loginAction({}, form({ email: seedUserEmail(1, "editor"), password: PASSWORD })).catch((e: unknown) => e);
    expect(ok).not.toHaveProperty("error"); // redirect thrown → signed in
  });

  it("workflow start: 429 rate_limited after the limit (checked before body parsing)", async () => {
    signInAs(EDITOR_A);
    const post = () => startRunRoute(new Request("http://localhost/api/workflows", { method: "POST", body: "{" }));
    for (let i = 0; i < RATE_LIMITS.workflowStart.limit; i++) expect((await post()).status).toBe(400);
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
