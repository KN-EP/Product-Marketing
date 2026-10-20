/**
 * M6 — pages and UI actions against the real test database (simulated mode).
 * Page components are called directly; a foreign or missing id must end in
 * Next.js notFound() (HTTP 404), exactly like the API routes.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { getAccessFallbackHTTPStatus, isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { isRedirectError } from "next/dist/client/components/redirect-error";
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

import ApprovalsPage from "@/app/(app)/approvals/page";
import EditAssetPage from "@/app/(app)/assets/[id]/edit/page";
import AssetPage from "@/app/(app)/assets/[id]/page";
import AssetsPage from "@/app/(app)/assets/page";
import CompetitorsPage from "@/app/(app)/competitors/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import DemoPage from "@/app/(app)/demo/page";
import ClaimsPage from "@/app/(app)/knowledge/claims/page";
import SourcesPage from "@/app/(app)/knowledge/sources/page";
import PersonasPage from "@/app/(app)/personas/page";
import ProductPage from "@/app/(app)/products/[id]/page";
import ProductsPage from "@/app/(app)/products/page";
import SettingsPage from "@/app/(app)/settings/page";
import WorkflowRunPage from "@/app/(app)/workflows/[id]/page";
import WorkflowsPage from "@/app/(app)/workflows/page";
import { createDraftVersionAction, decideAction, exportMarkdownAction } from "@/app/actions/review";
import { markRunFailedAction, startWorkflowAction } from "@/app/actions/workflow";
import { DEMO_TENANT_ID, OTHER_TENANT_ID, SIMULATED_BATTLECARD_CORRECTED } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { resetRateLimits } from "@/server/http/rate-limit";
import { tenantDb } from "@/server/db/tenant-scope";
import { SimulatedProvider } from "@/server/llm/simulated";
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
const EDITOR_A = actor("usr_demo", "editor");
const REVIEWER_A = actor("usr_demo", "reviewer");
const ADMIN_A = actor("usr_demo", "admin");
const ADMIN_B = actor("usr_other", "admin");
const signInAs = (a: Actor) => {
  jar.userId = a.userId!;
  jar.tenantId = a.tenantId;
};

const SEEDED_ASSETS = [A.asset, B.asset];
async function resetWorkflowData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
}

const runInput = () => ({
  productId: A.product,
  personaId: A.persona,
  market: "Germany",
  regulatoryTriggerId: A.regulatoryTrigger,
  competitorIds: [...A.competitors],
  requestNonce: randomUUID(),
});

async function completedRun() {
  const o = new InProcessOrchestrator({ db: getDb(), provider: () => new SimulatedProvider() });
  const { run } = await o.start(EDITOR_A, runInput());
  await o.execute(EDITOR_A, run.id);
  return o.get(EDITOR_A, run.id);
}

type Outcome = { rendered: true } | { status: number } | { redirect: true };
async function render(page: () => Promise<unknown>): Promise<Outcome> {
  try {
    await page();
    return { rendered: true };
  } catch (e) {
    if (isHTTPAccessFallbackError(e)) return { status: getAccessFallbackHTTPStatus(e) };
    if (isRedirectError(e)) return { redirect: true };
    throw e;
  }
}
const p = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await seed(getDb(), { password: randomBytes(18).toString("base64url") });
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

describe("pages render for a signed-in user (simulated mode)", () => {
  it("all list pages and the guided demo render", async () => {
    await completedRun();
    signInAs(REVIEWER_A);
    for (const page of [DashboardPage, ProductsPage, SourcesPage, ClaimsPage, PersonasPage, CompetitorsPage, WorkflowsPage, AssetsPage, ApprovalsPage, SettingsPage, DemoPage]) {
      expect(await render(() => page())).toEqual({ rendered: true });
    }
  });

  it("unauthenticated → redirect to /login", async () => {
    expect(await render(() => DashboardPage())).toEqual({ redirect: true });
    expect(await render(() => ProductPage(p(A.product)))).toEqual({ redirect: true });
  });
});

describe("cross-tenant: every id page and UI action → 404", () => {
  it("id pages: foreign and missing ids are 404, own ids render", async () => {
    const run = await completedRun();
    const assetId = run.outputs.find((o) => !o.internal)!.assetId;

    signInAs(ADMIN_B);
    expect(await render(() => ProductPage(p(A.product)))).toEqual({ status: 404 });
    expect(await render(() => WorkflowRunPage(p(run.run.id)))).toEqual({ status: 404 });
    expect(await render(() => AssetPage({ ...p(assetId), searchParams: Promise.resolve({}) }))).toEqual({ status: 404 });
    expect(await render(() => EditAssetPage(p(assetId)))).toEqual({ status: 404 });
    expect(await render(() => ProductPage(p("does_not_exist")))).toEqual({ status: 404 });

    signInAs(EDITOR_A);
    expect(await render(() => ProductPage(p(A.product)))).toEqual({ rendered: true });
    expect(await render(() => WorkflowRunPage(p(run.run.id)))).toEqual({ rendered: true });
    expect(await render(() => AssetPage({ ...p(assetId), searchParams: Promise.resolve({}) }))).toEqual({ rendered: true });
    expect(await render(() => EditAssetPage(p(assetId)))).toEqual({ rendered: true });
    // ?v= with a version id of another asset/tenant is 404 too
    expect(await render(() => AssetPage({ ...p(assetId), searchParams: Promise.resolve({ v: "not_a_version" }) }))).toEqual({ status: 404 });
  });

  it("UI actions: foreign ids → 404", async () => {
    const run = await completedRun();
    const bc = run.outputs.find((o) => o.assetType === "competitive_battlecard")!;
    signInAs(ADMIN_B);
    const notFound = { ok: false, status: 404, error: "not_found" };
    expect(await createDraftVersionAction(bc.assetId, SIMULATED_BATTLECARD_CORRECTED, "prepared_correction_simulated")).toEqual(notFound);
    expect(await markRunFailedAction(run.run.id)).toEqual(notFound);
    expect(await startWorkflowAction(runInput())).toEqual(notFound);
  });
});

describe("provenance: human_edit", () => {
  it("createDraftVersion stores human_edit + base version; export says 'Human-edited (based on v1)'", async () => {
    const run = await completedRun();
    const bc = run.outputs.find((o) => o.assetType === "competitive_battlecard")!;
    expect(bc.gatesPassed).toBe(false); // demo v1 is deliberately flawed

    signInAs(REVIEWER_A);
    await decideAction({ assetId: bc.assetId, versionId: bc.versionId, decision: "changes_requested", comment: "Use approved evidence" });
    signInAs(EDITOR_A);
    const draft = await createDraftVersionAction(bc.assetId, SIMULATED_BATTLECARD_CORRECTED);
    expect(draft.ok).toBe(true);
    const rec = await tenantDb(EDITOR_A, getDb()).assets.getRecord(bc.assetId);
    const v2 = rec.versions[1]!;
    expect(v2).toMatchObject({ versionNumber: 2, generationMode: "human_edit", basedOnVersionId: bc.versionId, gatesPassed: true });

    const { submitForReviewAction } = await import("@/app/actions/review");
    await submitForReviewAction(bc.assetId);
    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: bc.assetId, versionId: v2.id, decision: "approved" })).toMatchObject({ ok: true });
    const exp = await exportMarkdownAction(bc.assetId);
    expect((exp as { data: { markdown: string } }).data.markdown).toContain("| Generation | Human-edited (based on v1), human-reviewed |");
  });
});

describe("demo: prepared correction is saved only by the editor (origin label validated server-side)", () => {
  it("save with origin=prepared_correction_simulated → v2 human_edit (demo tenant, battlecard only)", async () => {
    const run = await completedRun();
    const bc = run.outputs.find((o) => o.assetType === "competitive_battlecard")!;
    const mf = run.outputs.find((o) => o.assetType === "messaging_framework")!;
    signInAs(REVIEWER_A);
    await decideAction({ assetId: bc.assetId, versionId: bc.versionId, decision: "changes_requested", comment: "Fix comparison" });

    signInAs(EDITOR_A);
    expect(await createDraftVersionAction(mf.assetId, SIMULATED_BATTLECARD_CORRECTED, "prepared_correction_simulated")).toMatchObject({
      ok: false,
      status: 409,
      error: "not_applicable",
    });
    // Nothing was stored for the messaging framework.
    expect((await tenantDb(EDITOR_A, getDb()).assets.getRecord(mf.assetId)).versions).toHaveLength(1);
    const res = await createDraftVersionAction(bc.assetId, SIMULATED_BATTLECARD_CORRECTED, "prepared_correction_simulated");
    expect(res).toMatchObject({ ok: true, data: { versionNumber: 2, gatesPassed: true, state: "draft" } });
    const v2 = (await tenantDb(EDITOR_A, getDb()).assets.getRecord(bc.assetId)).versions[1]!;
    expect(v2.generationMode).toBe("human_edit");
    const audit = await tenantDb(EDITOR_A, getDb()).audit.listFor("Asset", bc.assetId);
    expect(audit.at(-1)).toMatchObject({ action: "asset.version_created", metadata: { source: "prepared_correction_simulated" } });
  });
});

describe("stale runs: admin-only mark as failed", () => {
  it("editor 403; admin on a fresh run 409; admin on a stale run → failed", async () => {
    const o = new InProcessOrchestrator({ db: getDb(), provider: () => new SimulatedProvider() });
    const { run } = await o.start(EDITOR_A, runInput()); // queued, never executed

    signInAs(EDITOR_A);
    expect(await markRunFailedAction(run.id)).toMatchObject({ ok: false, status: 403 });
    signInAs(ADMIN_A);
    expect(await markRunFailedAction(run.id)).toMatchObject({ ok: false, status: 409, error: "not_stale" });

    await getDb().workflowRun.update({ where: { id: run.id }, data: { updatedAt: new Date(Date.now() - 20 * 60_000) } });
    const res = await markRunFailedAction(run.id);
    expect(res).toMatchObject({ ok: true, data: { status: "failed" } });
    expect((res as { data: { error: string } }).data.error).toMatch(/^stale:/);
    expect(await markRunFailedAction(run.id)).toMatchObject({ ok: false, status: 409, error: "not_active" });
  });
});

describe("startWorkflowAction", () => {
  it("starts a run for the editor's own tenant", async () => {
    signInAs(EDITOR_A);
    const res = await startWorkflowAction(runInput());
    expect(res).toMatchObject({ ok: true, data: { created: true } });
    // let the background execution finish before cleanup
    const runId = (res as { data: { runId: string } }).data.runId;
    for (let i = 0; i < 60; i++) {
      const r = await tenantDb(EDITOR_A, getDb()).workflowRuns.getById(runId);
      if (r.status === "completed" || r.status === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
    }
  });
});
