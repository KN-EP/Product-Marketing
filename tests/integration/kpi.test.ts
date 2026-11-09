/**
 * M11 — KPI tree, CSV import and the campaign_performance run against a REAL
 * Postgres (TEST_DATABASE_URL), simulated LLM mode only.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { getAccessFallbackHTTPStatus, isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
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

import CampaignPerformancePage from "@/app/(app)/campaigns/[id]/performance/page";
import { createKpiTreeAction, importKpiCsvAction, updateKpiAction } from "@/app/actions/kpi";
import { createDraftVersionAction, decideAction, exportMarkdownAction, submitForReviewAction } from "@/app/actions/review";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { CSV_LIMITS } from "@/domain/kpis/csv";
import type { PerformanceReviewV1 } from "@/domain/schemas/performance";
import { sampleCsv } from "@/lib/kpis";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { resetRateLimits } from "@/server/http/rate-limit";
import { createKpiTree } from "@/server/kpis/service";
import { SimulatedProvider } from "@/server/llm/simulated";
import { InProcessOrchestrator } from "@/server/workflow/orchestrator";
import { SEED_IDS, seed } from "../../prisma/seed";
import { approveStrategy } from "./strategy-helpers";

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
const VIEWER_A: Actor = { ...EDITOR_A, role: "viewer" };
const TODAY = new Date().toISOString().slice(0, 10);

const SEEDED_ASSETS = [A.asset, B.asset];
const SEEDED_CAMPAIGNS = [A.campaign, B.campaign];
const FOREIGN_KPI = "kpi_it_other";
async function resetData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
  await db.kpiImport.deleteMany({ where: { tenantId: tenants } });
  await db.kpi.deleteMany({ where: { tenantId: tenants } });
  await db.campaign.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_CAMPAIGNS } } });
}

const orchestrator = () => new InProcessOrchestrator({ db: getDb(), provider: () => new SimulatedProvider() });

/** nonce null = no nonce (idempotent start). */
async function run(kind: "campaign_gtm" | "campaign_performance", nonce: string | null = randomUUID()) {
  const o = orchestrator();
  // M12: the campaign package needs an approved GTM strategy brief.
  if (kind === "campaign_gtm") await approveStrategy(EDITOR_A, A.campaign);
  const { run, created } = await o.start(EDITOR_A, { kind, campaignId: A.campaign, ...(nonce ? { requestNonce: nonce } : {}) });
  if (created) await o.execute(EDITOR_A, run.id);
  return { created, details: await o.get(EDITOR_A, run.id) };
}

/** Campaign package → approve the plan (expert acknowledgement) → KPI tree with targets. */
async function readyKpiTree() {
  const { details } = await run("campaign_gtm");
  const plan = details.outputs.find((o) => o.assetType === "campaign_plan")!;
  signInAs(REVIEWER_A);
  expect(await decideAction({ assetId: plan.assetId, versionId: plan.versionId, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({ ok: true });
  signInAs(EDITOR_A);
  expect(await createKpiTreeAction(A.campaign)).toMatchObject({ ok: true, data: { kpis: 3 } });
  const kpis = await tenantDb(EDITOR_A, getDb()).kpis.listForCampaign(A.campaign);
  for (const [i, k] of kpis.entries()) expect(await updateKpiAction({ kpiId: k.id, target: [400, 100, 50][i] })).toMatchObject({ ok: true });
  return kpis;
}

const campaignStart = async () => (await getDb().campaign.findUniqueOrThrow({ where: { id: A.campaign } })).startsOn!.toISOString().slice(0, 10);

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
const p = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await seed(getDb(), { password: randomBytes(18).toString("base64url") });
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

describe("KPI tree", () => {
  it("comes only from an APPROVED plan, once; editors only; foreign campaign 404", async () => {
    signInAs(EDITOR_A);
    expect(await createKpiTreeAction(A.campaign)).toMatchObject({ ok: false, status: 409, error: "plan_not_approved" });
    const kpis = await readyKpiTree();
    expect(kpis.map((k) => k.name)).toEqual(["Checklist downloads", "Webinar registrations", "Sales-accepted meetings"]);
    expect(kpis.every((k) => k.target === null)).toBe(true); // listed before the targets were set
    expect(await createKpiTreeAction(A.campaign)).toMatchObject({ ok: false, status: 409, error: "kpi_tree_exists" });
    expect(await createKpiTreeAction(B.campaign)).toMatchObject({ ok: false, status: 404 });
    await expect(createKpiTree(VIEWER_A, getDb(), A.campaign)).rejects.toMatchObject({ status: 403 });
    const audit = await tenantDb(EDITOR_A, getDb()).audit.listFor("Campaign", A.campaign);
    expect(audit.some((e) => e.action === "kpi_tree.created")).toBe(true);
  });

  it("KPI edits: own KPI ok; foreign KPI 404; name or campaign cannot be changed", async () => {
    const [k] = await readyKpiTree();
    await getDb().kpi.create({
      data: { id: FOREIGN_KPI, tenantId: OTHER_TENANT_ID, campaignId: B.campaign, name: "Other", funnelStage: "awareness", definition: "x", dataSource: "x" },
    });
    signInAs(EDITOR_A);
    expect(await updateKpiAction({ kpiId: FOREIGN_KPI, target: 1 })).toMatchObject({ ok: false, status: 404 });
    expect(await updateKpiAction({ kpiId: k!.id, name: "Renamed" })).toMatchObject({ ok: false, status: 400 });
    expect(await updateKpiAction({ kpiId: k!.id, campaignId: B.campaign, target: 1 })).toMatchObject({ ok: false, status: 400 });
    expect(await updateKpiAction({ kpiId: k!.id, baseline: 12.5, direction: "lower_is_better" })).toMatchObject({ ok: true });
    const row = await getDb().kpi.findUniqueOrThrow({ where: { id: k!.id } });
    expect(row).toMatchObject({ name: "Checklist downloads", direction: "lower_is_better", campaignId: A.campaign });
    expect(row.baseline?.toNumber()).toBe(12.5);
    expect((await getDb().kpi.findUniqueOrThrow({ where: { id: FOREIGN_KPI } })).target).toBeNull();
  });
});

describe("CSV import", () => {
  it("imports, reports rejected rows, replaces the same KPI and date; isolation and limits", async () => {
    signInAs(EDITOR_A);
    expect(await importKpiCsvAction({ campaignId: A.campaign, fileName: "x.csv", csv: "kpi,date,value" })).toMatchObject({
      ok: false,
      status: 409,
      error: "no_kpi_tree",
    });
    const kpis = await readyKpiTree();
    const start = await campaignStart();
    const csv = sampleCsv(kpis, start, TODAY) + `Unknown,${TODAY},1\n"Checklist downloads",not-a-date,1\n`;
    const res = await importKpiCsvAction({ campaignId: A.campaign, fileName: "sample.csv", csv });
    expect(res).toMatchObject({ ok: true });
    const data = (res as { data: { accepted: number; rowCount: number; rejected: { line: number; reason: string }[] } }).data;
    expect(data.rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/Unknown KPI/), expect.stringMatching(/Invalid date/)]);
    expect(data.accepted).toBe(data.rowCount - 2);
    const count = await getDb().kpiMeasurement.count({ where: { kpi: { campaignId: A.campaign } } });
    expect(count).toBe(data.accepted);

    // Same KPI + date again → replaced, not duplicated.
    const firstDay = csv.split("\n")[1]!.split(",")[1]!;
    expect(await importKpiCsvAction({ campaignId: A.campaign, fileName: "fix.csv", csv: `kpi,date,value\nChecklist downloads,${firstDay},999\n` })).toMatchObject({ ok: true });
    expect(await getDb().kpiMeasurement.count({ where: { kpi: { campaignId: A.campaign } } })).toBe(count);
    const m = await getDb().kpiMeasurement.findFirstOrThrow({ where: { kpi: { campaignId: A.campaign, name: "Checklist downloads" }, periodStart: new Date(`${firstDay}T00:00:00Z`) } });
    expect(m.value.toNumber()).toBe(999);

    expect(await importKpiCsvAction({ campaignId: B.campaign, fileName: "x.csv", csv: "kpi,date,value\n" })).toMatchObject({ ok: false, status: 404 });
    expect(await importKpiCsvAction({ campaignId: A.campaign, fileName: "big.csv", csv: "x".repeat(CSV_LIMITS.maxBytes + 1) })).toMatchObject({ ok: false, status: 413 });
    expect(await importKpiCsvAction({ campaignId: A.campaign, fileName: "bad.csv", csv: "a,b\n1,2" })).toMatchObject({ ok: false, status: 400, error: "invalid_csv" });

    const audit = await tenantDb(EDITOR_A, getDb()).audit.listFor("Campaign", A.campaign);
    const imported = audit.filter((e) => e.action === "kpi.imported");
    expect(imported).toHaveLength(2);
    expect(JSON.stringify(imported[0]!.metadata)).not.toContain("Checklist");
  });
});

describe("performance page and campaign_performance run", () => {
  it("page: own campaign renders (with and without data); the other tenant's campaign is a 404", async () => {
    signInAs(EDITOR_A);
    expect(await render(() => CampaignPerformancePage(p(A.campaign)))).toEqual({ rendered: true });
    expect(await render(() => CampaignPerformancePage(p(B.campaign)))).toEqual({ status: 404 });
    const kpis = await readyKpiTree();
    await importKpiCsvAction({ campaignId: A.campaign, fileName: "s.csv", csv: sampleCsv(kpis, await campaignStart(), TODAY) });
    expect(await render(() => CampaignPerformancePage(p(A.campaign)))).toEqual({ rendered: true });
  });

  it("needs data; produces a gated review with server-computed numbers; edits cannot change them; approve → export", async () => {
    const kpis = await readyKpiTree();
    await expect(orchestrator().start(EDITOR_A, { kind: "campaign_performance", campaignId: A.campaign })).rejects.toMatchObject({
      status: 409,
      code: "no_kpi_data",
    });
    await expect(orchestrator().start(EDITOR_A, { kind: "campaign_performance", campaignId: B.campaign })).rejects.toThrow(/not found/);
    signInAs(EDITOR_A);
    await importKpiCsvAction({ campaignId: A.campaign, fileName: "s.csv", csv: sampleCsv(kpis, await campaignStart(), TODAY) });

    const { details } = await run("campaign_performance");
    expect(details.run).toMatchObject({ kind: "campaign_performance", status: "completed", inputRefs: { campaignId: A.campaign } });
    expect(details.outputs).toHaveLength(1);
    const out = details.outputs[0]!;
    expect(out).toMatchObject({ assetType: "performance_review", assetState: "pending_review", gatesPassed: true, internal: false });
    expect(out.title).toContain(`(${TODAY})`);

    const rec = await tenantDb(EDITOR_A, getDb()).assets.getRecord(out.assetId);
    const content = rec.versions[0]!.content as PerformanceReviewV1;
    expect(content.asOf).toBe(TODAY);
    expect(content.kpiSnapshot.map((k) => [k.name, k.target])).toEqual([
      ["Checklist downloads", 400],
      ["Webinar registrations", 100],
      ["Sales-accepted meetings", 50],
    ]);
    expect(content.kpiSnapshot.every((k) => k.measurements > 0 && k.actual !== null)).toBe(true);

    // Request changes, then a human edit that tries to change the numbers: they are restored from v1.
    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: out.assetId, versionId: out.versionId, decision: "changes_requested", comment: "Shorter summary" })).toMatchObject({ ok: true });
    signInAs(EDITOR_A);
    const tampered = { ...content, summary: { ...content.summary, text: "Shorter summary." }, kpiSnapshot: content.kpiSnapshot.map((k) => ({ ...k, actual: 10_000 })) };
    const v2 = await createDraftVersionAction(out.assetId, tampered);
    expect(v2).toMatchObject({ ok: true, data: { versionNumber: 2, gatesPassed: true } });
    const stored = (await tenantDb(EDITOR_A, getDb()).assets.getRecord(out.assetId)).versions[1]!.content as PerformanceReviewV1;
    expect(stored.summary.text).toBe("Shorter summary.");
    expect(stored.kpiSnapshot).toEqual(content.kpiSnapshot);

    expect(await submitForReviewAction(out.assetId)).toMatchObject({ ok: true });
    signInAs(REVIEWER_A);
    const v2Id = (v2 as { data: { versionId: string } }).data.versionId;
    expect(await decideAction({ assetId: out.assetId, versionId: v2Id, decision: "approved" })).toMatchObject({ ok: true, data: { state: "approved" } });
    const md = (await exportMarkdownAction(out.assetId)) as { ok: true; data: { markdown: string } };
    expect(md.data.markdown).toContain("| KPI | Stage | Actual | Target | Expected to date | Pace | Status |");
    expect(md.data.markdown).toContain("| Webinar registrations | consideration |");

    signInAs(EDITOR_A);
    expect(await render(() => CampaignPerformancePage(p(A.campaign)))).toEqual({ rendered: true });
  });

  it("same data → same run (without a nonce); a new import → a new run", async () => {
    const kpis = await readyKpiTree();
    signInAs(EDITOR_A);
    await importKpiCsvAction({ campaignId: A.campaign, fileName: "s.csv", csv: sampleCsv(kpis, await campaignStart(), TODAY) });
    const first = await run("campaign_performance", null);
    const again = await run("campaign_performance", null);
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false });
    expect(again.details.run.id).toBe(first.details.run.id);
    await importKpiCsvAction({ campaignId: A.campaign, fileName: "more.csv", csv: `kpi,date,value\nWebinar registrations,${TODAY},7\n` });
    const third = await run("campaign_performance", null);
    expect(third.created).toBe(true);
  });
});
