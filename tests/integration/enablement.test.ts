/**
 * M13a + M13b against a REAL Postgres (TEST_DATABASE_URL), simulated LLM mode
 * only: product assets and sales toolkit (campaign_asset run) — strategy gate,
 * one asset per run linked to the campaign, the type-specific gates, the
 * prepared one-pager correction, idempotency per deliverable type and tenant
 * isolation of the new entry point.
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
import AssetPage from "@/app/(app)/assets/[id]/page";
import { createDraftVersionAction, decideAction, exportMarkdownAction, submitForReviewAction } from "@/app/actions/review";
import { startWorkflowAction } from "@/app/actions/workflow";
import { SIMULATED_ONE_PAGER_CORRECTED } from "@/demo/enablement-fixtures";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import { InProcessOrchestrator } from "@/server/workflow/orchestrator";
import { SEED_IDS, seed } from "../../prisma/seed";
import { approveStrategy } from "./strategy-helpers";

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
async function resetData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
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

async function runAsset(deliverableType: string, provider?: () => LlmProvider) {
  const o = orchestrator(provider);
  const { run } = await o.start(EDITOR_A, { kind: "campaign_asset", campaignId: A.campaign, deliverableType, requestNonce: randomUUID() });
  const done = await o.execute(EDITOR_A, run.id);
  return { run: done, details: await o.get(EDITOR_A, run.id) };
}

async function render(page: () => Promise<unknown>): Promise<{ rendered: true } | { status: number }> {
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

describe("campaign_asset: product assets and sales toolkit (M13a + M13b)", () => {
  it("refused (409) until the GTM strategy brief is approved; then one asset per run, linked to the campaign", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "campaign_asset", campaignId: A.campaign, deliverableType: "one_pager", requestNonce: randomUUID() })).toMatchObject({
      ok: false,
      status: 409,
      error: "strategy_not_approved",
    });

    await approveStrategy(EDITOR_A, A.campaign);
    const rec = new Recording();
    const { run, details } = await runAsset("one_pager", () => rec);
    expect(run.status).toBe("completed");
    expect(details.outputs).toEqual([expect.objectContaining({ assetType: "one_pager", assetState: "pending_review", gatesPassed: false })]);
    expect(details.outputs[0]!.title).toMatch(/^\[SIMULATED\] One-pager — /);
    expect(rec.prompts).toHaveLength(1);
    expect(rec.prompts[0]!.user).toMatch(/^requested_deliverable_type: one_pager$/m);
    expect(rec.prompts[0]!.user).toContain("<gtm_strategy>");
    const asset = await getDb().asset.findUniqueOrThrow({ where: { id: details.outputs[0]!.assetId } });
    expect(asset.campaignId).toBe(A.campaign);
    expect((await getDb().workflowRun.findUniqueOrThrow({ where: { id: run.id } })).campaignId).toBe(A.campaign);

    signInAs(EDITOR_A);
    expect(await render(() => CampaignPage(p(A.campaign)))).toEqual({ rendered: true });
    expect(await render(() => AssetPage(p(asset.id)))).toEqual({ rendered: true });
  });

  it("the one-pager v1 is blocked by G11; the prepared correction passes and can be approved and exported", async () => {
    await approveStrategy(EDITOR_A, A.campaign);
    const op = (await runAsset("one_pager")).details.outputs[0]!;
    const v1 = await getDb().assetVersion.findUniqueOrThrow({ where: { id: op.versionId } });
    expect((v1.gateReport as { findings: { gate: string; severity: string }[] }).findings).toContainEqual(
      expect.objectContaining({ gate: "G11_number_basis", severity: "critical" }),
    );

    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: op.assetId, versionId: op.versionId, decision: "approved" })).toMatchObject({ ok: false });

    signInAs(EDITOR_A);
    const v2 = await createDraftVersionAction(op.assetId, SIMULATED_ONE_PAGER_CORRECTED, "prepared_correction_simulated");
    expect(v2).toMatchObject({ ok: true, data: { versionNumber: 2, gatesPassed: true, state: "draft" } });
    expect(await submitForReviewAction(op.assetId)).toMatchObject({ ok: true });

    signInAs(REVIEWER_A);
    const v2Id = (v2 as { data: { versionId: string } }).data.versionId;
    expect(await decideAction({ assetId: op.assetId, versionId: v2Id, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({ ok: true });
    const md = (await exportMarkdownAction(op.assetId)) as { ok: boolean; data?: { markdown?: string } };
    expect(md).toMatchObject({ ok: true });
  });

  it("an ROI argument with marked assumptions passes the gates; other deliverables get no prepared correction", async () => {
    await approveStrategy(EDITOR_A, A.campaign);
    const roi = (await runAsset("roi_argument")).details.outputs[0]!;
    expect(roi).toMatchObject({ assetType: "roi_argument", gatesPassed: true });
    signInAs(EDITOR_A);
    expect(await createDraftVersionAction(roi.assetId, SIMULATED_ONE_PAGER_CORRECTED, "prepared_correction_simulated")).toMatchObject({
      ok: false,
      status: 409,
      error: "not_applicable",
    });
  });

  it("idempotent per deliverable type: same type and strategy → same run; another type → a new run", async () => {
    await approveStrategy(EDITOR_A, A.campaign);
    const o = orchestrator();
    const first = await o.start(EDITOR_A, { kind: "campaign_asset", campaignId: A.campaign, deliverableType: "demo_story" });
    expect((await o.start(EDITOR_A, { kind: "campaign_asset", campaignId: A.campaign, deliverableType: "demo_story" })).run.id).toBe(first.run.id);
    const other = await o.start(EDITOR_A, { kind: "campaign_asset", campaignId: A.campaign, deliverableType: "discovery_guide" });
    expect(other.created).toBe(true);
    expect(other.run.id).not.toBe(first.run.id);
  });

  it("another tenant's campaign → 404; viewers 403; unknown deliverable type or injected tenantId → 400", async () => {
    await approveStrategy(EDITOR_A, A.campaign);
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "campaign_asset", campaignId: B.campaign, deliverableType: "one_pager", requestNonce: randomUUID() })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await startWorkflowAction({ kind: "campaign_asset", campaignId: A.campaign, deliverableType: "messaging_framework", requestNonce: randomUUID() })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await startWorkflowAction({ kind: "campaign_asset", campaignId: A.campaign, deliverableType: "one_pager", tenantId: OTHER_TENANT_ID, requestNonce: randomUUID() }),
    ).toMatchObject({ ok: false, status: 400 });
    await expect(orchestrator().start(VIEWER_A, { kind: "campaign_asset", campaignId: A.campaign, deliverableType: "one_pager" })).rejects.toMatchObject({ status: 403 });
    expect(await getDb().workflowRun.count({ where: { tenantId: DEMO_TENANT_ID, kind: "campaign_asset", campaignId: B.campaign } })).toBe(0);
  });
});
