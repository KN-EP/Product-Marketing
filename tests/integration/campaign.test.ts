/**
 * M8–M10 — campaigns and the campaign_gtm run against a REAL Postgres
 * (TEST_DATABASE_URL), simulated LLM mode only. Covers tenant isolation of the
 * new entry points (campaign page, createCampaignAction, campaign runs), the
 * full run, the content-matrix correction flow and export.
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

import CampaignPage from "@/app/(app)/campaigns/[id]/page";
import CampaignsPage from "@/app/(app)/campaigns/page";
import WorkflowRunPage from "@/app/(app)/workflows/[id]/page";
import { createCampaignAction } from "@/app/actions/campaign";
import { createDraftVersionAction, decideAction, exportMarkdownAction, submitForReviewAction } from "@/app/actions/review";
import { startWorkflowAction } from "@/app/actions/workflow";
import { POST as startRunRoute } from "@/app/api/workflows/route";
import { DEMO_TENANT_ID, OTHER_TENANT_ID, SIMULATED_CONTENT_MATRIX_CORRECTED, SIMULATED_SALES_PLAY_OUTREACH } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { createCampaign } from "@/server/campaigns/service";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { resetDemoData } from "@/server/demo/reset";
import { resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
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

const SEEDED_ASSETS = [A.asset, B.asset];
const OTHER_PERSONA = "per_it_demo_dpo";
const SEEDED_CAMPAIGNS = [A.campaign, B.campaign];
async function resetData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
  await db.campaign.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_CAMPAIGNS } } });
}

const campaignInput = (over: Record<string, unknown> = {}) => ({
  name: "Retention push Q1",
  type: "retention",
  objective: "Keep existing customers active in the AI system register.",
  productId: A.product,
  personaId: A.persona,
  market: "DACH mid-market",
  channels: ["Email", "Customer success"],
  startsOn: "2027-01-04",
  endsOn: "2027-02-26",
  budgetEur: 5000,
  ...over,
});

const orchestrator = (provider: () => LlmProvider = () => new SimulatedProvider()) => new InProcessOrchestrator({ db: getDb(), provider });

async function campaignRun(campaignId: string = A.campaign, provider?: () => LlmProvider) {
  const o = orchestrator(provider);
  const { run } = await o.start(EDITOR_A, { kind: "campaign_gtm", campaignId, requestNonce: randomUUID() });
  const done = await o.execute(EDITOR_A, run.id);
  return { o, run: done, details: await o.get(EDITOR_A, run.id) };
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
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const postRun = (body: unknown) =>
  startRunRoute(new Request("http://localhost/api/workflows", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeAll(async () => {
  await seed(getDb(), { password: PASSWORD });
});
afterAll(async () => {
  await resetData();
  await getDb().persona.deleteMany({ where: { id: OTHER_PERSONA } });
  await getDb().$disconnect();
});
beforeEach(async () => {
  resetRateLimits();
  delete jar.userId;
  delete jar.tenantId;
  await resetData();
});

describe("campaign briefings", () => {
  it("an editor creates a campaign in their own tenant; audited without free text", async () => {
    signInAs(EDITOR_A);
    const res = await createCampaignAction(campaignInput());
    expect(res).toMatchObject({ ok: true });
    const id = (res as { data: { campaignId: string } }).data.campaignId;
    const row = await getDb().campaign.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ tenantId: DEMO_TENANT_ID, type: "retention", channels: ["Email", "Customer success"], isSynthetic: false });
    expect(row.startsOn?.toISOString()).toBe("2027-01-04T00:00:00.000Z");
    expect(row.budgetEur?.toNumber()).toBe(5000);
    const audit = await tenantDb(EDITOR_A, getDb()).audit.listFor("Campaign", id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "campaign.created", actorId: EDITOR_A.userId, metadata: { type: "retention", channels: 2 } });
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain("Keep existing customers");
  });

  it("foreign product or persona ids → 404 (same as missing); nothing is created", async () => {
    signInAs(EDITOR_A);
    expect(await createCampaignAction(campaignInput({ productId: B.product }))).toMatchObject({ ok: false, status: 404, error: "not_found" });
    expect(await createCampaignAction(campaignInput({ personaId: B.persona }))).toMatchObject({ ok: false, status: 404, error: "not_found" });
    expect(await createCampaignAction(campaignInput({ productId: "prd_missing" }))).toMatchObject({ ok: false, status: 404 });
    expect(await getDb().campaign.count({ where: { id: { notIn: SEEDED_CAMPAIGNS } } })).toBe(0);
  });

  it("an injected tenantId or invalid dates are rejected (400); viewers get 403; anonymous 401", async () => {
    signInAs(EDITOR_A);
    expect(await createCampaignAction(campaignInput({ tenantId: OTHER_TENANT_ID }))).toMatchObject({ ok: false, status: 400, error: "invalid_input" });
    expect(await createCampaignAction(campaignInput({ endsOn: "2026-12-01" }))).toMatchObject({ ok: false, status: 400 });
    await expect(createCampaign(VIEWER_A, getDb(), campaignInput())).rejects.toMatchObject({ status: 403 });
    delete jar.userId;
    delete jar.tenantId;
    expect(await createCampaignAction(campaignInput())).toMatchObject({ ok: false, status: 401 });
  });
});

describe("tenant isolation of campaigns", () => {
  it("campaign page: own campaign renders, the other tenant's campaign is a 404", async () => {
    signInAs(EDITOR_A);
    expect(await render(() => CampaignsPage())).toEqual({ rendered: true });
    expect(await render(() => CampaignPage(p(A.campaign)))).toEqual({ rendered: true });
    expect(await render(() => CampaignPage(p(B.campaign)))).toEqual({ status: 404 });
    expect(await render(() => CampaignPage(p("cmpg_missing")))).toEqual({ status: 404 });
  });

  it("a campaign run on another tenant's campaign → 404 (action and API); no run is created", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "campaign_gtm", campaignId: B.campaign, requestNonce: randomUUID() })).toMatchObject({
      ok: false,
      status: 404,
    });
    const r = await postRun({ kind: "campaign_gtm", campaignId: B.campaign });
    expect(r.status).toBe(404);
    expect(await postRun({ kind: "campaign_gtm", campaignId: A.campaign, tenantId: OTHER_TENANT_ID }).then((x) => x.status)).toBe(400);
    expect(await getDb().workflowRun.count({ where: { tenantId: { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] } } })).toBe(0);
  });

  it("the database refuses an asset that points at another tenant's campaign (composite FK)", async () => {
    await expect(
      getDb().asset.create({ data: { tenantId: DEMO_TENANT_ID, type: "campaign_plan", title: "cross-tenant", campaignId: B.campaign } }),
    ).rejects.toThrow();
  });
});

describe("campaign_gtm run (simulated)", () => {
  it("creates plan, content matrix and sales play in pending_review, linked to the campaign; no internal brief", async () => {
    const { run, details } = await campaignRun();
    expect(run).toMatchObject({ kind: "campaign_gtm", status: "completed", generationMode: "simulated", costEstimateUsd: 0 });
    expect(run.inputRefs).toEqual({ campaignId: A.campaign });
    expect(run.promptVersions).toEqual({ "agent-d.campaign-plan": "1.0.0", "agent-e.content-matrix": "1.0.0", "agent-f.sales-play": "1.0.0" });
    expect(details.outputs.map((o) => o.assetType)).toEqual(["campaign_plan", "content_matrix", "sales_play"]);
    expect(details.outputs.every((o) => !o.internal && o.assetState === "pending_review")).toBe(true);
    expect(Object.fromEntries(details.outputs.map((o) => [o.assetType, o.gatesPassed]))).toEqual({
      campaign_plan: true,
      content_matrix: false, // demo v1 is deliberately flawed
      sales_play: true,
    });
    const rows = await getDb().asset.findMany({ where: { id: { in: details.outputs.map((o) => o.assetId) } } });
    expect(rows.every((a) => a.campaignId === A.campaign && a.title.endsWith("[SYNTHETIC] AI inventory campaign — CISOs DACH"))).toBe(true);
    expect((await getDb().workflowRun.findUniqueOrThrow({ where: { id: run.id } })).campaignId).toBe(A.campaign);

    signInAs(EDITOR_A);
    expect(await render(() => CampaignPage(p(A.campaign)))).toEqual({ rendered: true });
    expect(await render(() => WorkflowRunPage(p(run.id)))).toEqual({ rendered: true });
  });

  it("is idempotent without a nonce and respects the start rules", async () => {
    const o = orchestrator();
    const first = await o.start(EDITOR_A, { kind: "campaign_gtm", campaignId: A.campaign });
    const again = await o.start(EDITOR_A, { kind: "campaign_gtm", campaignId: A.campaign });
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, run: { id: first.run.id } });
    await expect(o.start(REVIEWER_A, { kind: "campaign_gtm" })).rejects.toMatchObject({ status: 400 });
    await expect(o.start(VIEWER_A, { kind: "campaign_gtm", campaignId: A.campaign })).rejects.toMatchObject({ status: 403 });
  });

  it("the retention campaign gets a retention play that lists its data requirements", async () => {
    const { campaignId } = await createCampaign(EDITOR_A, getDb(), campaignInput());
    const { details } = await campaignRun(campaignId);
    const sp = details.outputs.find((o) => o.assetType === "sales_play")!;
    const rec = await tenantDb(EDITOR_A, getDb()).assets.getRecord(sp.assetId);
    const content = rec.versions[0]!.content as { playType: string; dataRequirements: string[] };
    expect(content.playType).toBe("retention_play");
    expect(content.dataRequirements.length).toBeGreaterThan(0);
  });

  it("an APPROVED messaging framework for the same product and persona is context for D–F; unapproved or other-persona ones are not", async () => {
    class Recording implements LlmProvider {
      readonly mode = "simulated" as const;
      readonly external = false;
      readonly modelId = "simulated-fixtures-v1";
      readonly maxTokens = 0;
      prompts: RenderedPrompt[] = [];
      private readonly inner = new SimulatedProvider();
      generate<S extends z.ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, opts: GenerateOptions): Promise<LlmResult<z.infer<S>>> {
        this.prompts.push(prompt);
        return this.inner.generate(spec, prompt, opts);
      }
    }
    // Generate a messaging framework through the PMM run; it is pending review (not approved).
    const pmm = orchestrator();
    const { run: pmmRun } = await pmm.start(EDITOR_A, {
      productId: A.product,
      personaId: A.persona,
      market: "DACH mid-market",
      regulatoryTriggerId: A.regulatoryTrigger,
      competitorIds: [...A.competitors],
      requestNonce: randomUUID(),
    });
    await pmm.execute(EDITOR_A, pmmRun.id);
    const mf = (await pmm.get(EDITOR_A, pmmRun.id)).outputs.find((o) => o.assetType === "messaging_framework")!;

    const before = new Recording();
    await campaignRun(A.campaign, () => before);
    expect(before.prompts.some((x) => x.user.includes("<messaging_framework>"))).toBe(false);

    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: mf.assetId, versionId: mf.versionId, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({ ok: true });

    const after = new Recording();
    const { run } = await campaignRun(A.campaign, () => after);
    expect(after.prompts).toHaveLength(3);
    expect(after.prompts.every((x) => x.user.includes("<messaging_framework>"))).toBe(true);
    const history = await tenantDb(EDITOR_A, getDb()).audit.listFor("WorkflowRun", run.id);
    expect(history.find((h) => h.action === "workflow.validation")?.metadata).toMatchObject({
      campaignPlanPassedOn: true,
      approvedMessagingFrameworkVersionId: mf.versionId,
    });

    // A campaign for another persona of the same product does not get the CISO messaging.
    await getDb().persona.upsert({
      where: { id: OTHER_PERSONA },
      create: { id: OTHER_PERSONA, tenantId: DEMO_TENANT_ID, name: "[SYNTHETIC] DPO", role: "DPO", market: "DACH mid-market", isSynthetic: true },
      update: {},
    });
    const { campaignId } = await createCampaign(EDITOR_A, getDb(), campaignInput({ type: "demand_generation", personaId: OTHER_PERSONA }));
    const other = new Recording();
    await campaignRun(campaignId, () => other);
    expect(other.prompts).toHaveLength(3);
    expect(other.prompts.some((x) => x.user.includes("<messaging_framework>"))).toBe(false);
  });
});

describe("campaign package review: blocked content matrix → correction → approval → export", () => {
  it("runs the demo storyline through the real actions", async () => {
    const { details } = await campaignRun();
    const cm = details.outputs.find((o) => o.assetType === "content_matrix")!;
    const sp = details.outputs.find((o) => o.assetType === "sales_play")!;

    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: cm.assetId, versionId: cm.versionId, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({
      ok: false,
      status: 422,
      error: "gates_failed",
    });
    expect(await decideAction({ assetId: cm.assetId, versionId: cm.versionId, decision: "changes_requested", comment: "Remove the guarantee" })).toMatchObject({
      ok: true,
    });

    signInAs(EDITOR_A);
    // The prepared correction exists for the content matrix, not for the sales play.
    expect(await createDraftVersionAction(sp.assetId, SIMULATED_SALES_PLAY_OUTREACH, "prepared_correction_simulated")).toMatchObject({
      ok: false,
      status: 409,
      error: "not_applicable",
    });
    const v2 = await createDraftVersionAction(cm.assetId, SIMULATED_CONTENT_MATRIX_CORRECTED, "prepared_correction_simulated");
    expect(v2).toMatchObject({ ok: true, data: { versionNumber: 2, gatesPassed: true, state: "draft" } });
    expect(await submitForReviewAction(cm.assetId)).toMatchObject({ ok: true, data: { state: "pending_review" } });

    signInAs(REVIEWER_A);
    const v2Id = (v2 as { data: { versionId: string } }).data.versionId;
    expect(await decideAction({ assetId: cm.assetId, versionId: v2Id, decision: "approved" })).toMatchObject({ ok: false, status: 422, error: "expert_ack_required" });
    expect(await decideAction({ assetId: cm.assetId, versionId: v2Id, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({
      ok: true,
      data: { state: "approved" },
    });
    // The sales play has no regulatory statements: approval without acknowledgement.
    expect(await decideAction({ assetId: sp.assetId, versionId: sp.versionId, decision: "approved" })).toMatchObject({ ok: true });

    const exported = await exportMarkdownAction(cm.assetId);
    expect(exported).toMatchObject({ ok: true });
    const md = (exported as { data: { markdown: string } }).data.markdown;
    expect(md).toContain("| Asset type | content_matrix |");
    expect(md).toContain("| Version | v2");
    expect(md).toContain("Start your AI Act preparation");
    expect(md).not.toContain("guaranteed");

    signInAs(EDITOR_A);
    expect(await render(() => CampaignPage(p(A.campaign)))).toEqual({ rendered: true });
    const states = await getDb().asset.findMany({ where: { campaignId: A.campaign }, select: { type: true, state: true } });
    expect(Object.fromEntries(states.map((s) => [s.type, s.state]))).toEqual({
      campaign_plan: "pending_review",
      content_matrix: "approved",
      sales_play: "approved",
    });
  });
});

describe("demo reset", () => {
  it("removes demo campaigns (after their runs and assets); the seed restores the seeded ones", async () => {
    await createCampaign(EDITOR_A, getDb(), campaignInput());
    await campaignRun();
    const counts = await resetDemoData(getDb());
    expect(counts.campaigns).toBeGreaterThanOrEqual(3);
    expect(await getDb().campaign.count({ where: { tenantId: { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] } } })).toBe(0);
    await seed(getDb(), { password: PASSWORD });
    expect(await getDb().campaign.findUnique({ where: { id: A.campaign } })).not.toBeNull();
    expect(await getDb().asset.findUnique({ where: { id: A.asset } })).not.toBeNull();
  });
});
