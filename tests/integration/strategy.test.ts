/**
 * M12 "strategy first" against a REAL Postgres (TEST_DATABASE_URL), simulated
 * LLM mode only: use case map per product, GTM strategy brief as the gate of
 * the campaign package, releases and the release communication plan — plus
 * tenant isolation of every new entry point.
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

import ProductPage from "@/app/(app)/products/[id]/page";
import ReleasePage from "@/app/(app)/releases/[id]/page";
import ReleasesPage from "@/app/(app)/releases/page";
import WorkflowRunPage from "@/app/(app)/workflows/[id]/page";
import CampaignPage from "@/app/(app)/campaigns/[id]/page";
import DemoPage from "@/app/(app)/demo/page";
import { createReleaseAction } from "@/app/actions/release";
import { decideAction, exportMarkdownAction } from "@/app/actions/review";
import { startWorkflowAction } from "@/app/actions/workflow";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { resetDemoData } from "@/server/demo/reset";
import { resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import { createRelease } from "@/server/releases/service";
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
  await db.release.deleteMany({ where: { tenantId: tenants, id: { notIn: [A.release, B.release] } } });
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

async function runKind(input: Record<string, unknown>, provider?: () => LlmProvider) {
  const o = orchestrator(provider);
  const { run } = await o.start(EDITOR_A, { requestNonce: randomUUID(), ...input });
  const done = await o.execute(EDITOR_A, run.id);
  return { run: done, details: await o.get(EDITOR_A, run.id) };
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

const releaseInput = (over: Record<string, unknown> = {}) => ({
  productId: A.product,
  name: "Reminders and bulk export",
  version: "2.5",
  type: "feature_update",
  plannedOn: "2027-03-01",
  summary: "Owner reminders and bulk export of documentation packs.",
  changes: ["Owner reminders for due reviews", "Bulk export"],
  audiences: ["internal_sales", "existing_customers"],
  communicationChannels: ["Email"],
  salesChannels: ["customer_success"],
  ...over,
});

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

describe("seeded data (M12)", () => {
  it("the demo campaign keeps communication and sales channels apart; each tenant has a planned release", async () => {
    const c = await getDb().campaign.findUniqueOrThrow({ where: { id: A.campaign } });
    expect(c.communicationChannels).toEqual(["LinkedIn", "Email", "Webinar"]);
    expect(c.salesChannels).toEqual(["direct_sales", "customer_success"]);
    expect(await getDb().release.findUniqueOrThrow({ where: { id: A.release } })).toMatchObject({ tenantId: DEMO_TENANT_ID, version: "2.4" });
    expect(await getDb().release.findUniqueOrThrow({ where: { id: B.release } })).toMatchObject({ tenantId: OTHER_TENANT_ID });
  });
});

describe("use case definition (station 'Use cases & ICP')", () => {
  it("creates a use case map in pending_review for the product; the product page lists it", async () => {
    const { run, details } = await runKind({ kind: "use_case_definition", productId: A.product, market: "DACH mid-market" });
    expect(run).toMatchObject({ kind: "use_case_definition", status: "completed", promptVersions: { "agent-uc.use-case-map": "1.0.0" } });
    expect(details.outputs).toEqual([expect.objectContaining({ assetType: "use_case_map", assetState: "pending_review", gatesPassed: true })]);
    expect(run.inputRefs).toEqual({ productId: A.product, market: "DACH mid-market" });
    signInAs(EDITOR_A);
    expect(await render(() => ProductPage(p(A.product)))).toEqual({ rendered: true });
    expect(await render(() => WorkflowRunPage(p(run.id)))).toEqual({ rendered: true });
  });

  it("the use case agent sees the tenant's personas as known buyer roles", async () => {
    const rec = new Recording();
    await runKind({ kind: "use_case_definition", productId: A.product, market: "DACH" }, () => rec);
    expect(rec.prompts[0]!.user).toMatch(/known_personas: .*CISO/);
  });

  it("a foreign product id → 404 (action); no run is created", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "use_case_definition", productId: B.product, market: "DACH", requestNonce: randomUUID() })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await getDb().workflowRun.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(0);
  });
});

describe("GTM strategy brief gates the campaign package", () => {
  it("the package is refused (409) until a reviewer approves the strategy brief; a pending brief is not enough", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "campaign_gtm", campaignId: A.campaign, requestNonce: randomUUID() })).toMatchObject({
      ok: false,
      status: 409,
      error: "strategy_not_approved",
    });
    const { details } = await runKind({ kind: "campaign_strategy", campaignId: A.campaign });
    const brief = details.outputs[0]!;
    expect(brief).toMatchObject({ assetType: "gtm_strategy_brief", assetState: "pending_review", gatesPassed: true });
    expect(await startWorkflowAction({ kind: "campaign_gtm", campaignId: A.campaign, requestNonce: randomUUID() })).toMatchObject({ status: 409 });

    signInAs(REVIEWER_A);
    // Regulatory buying trigger → expert acknowledgement required, like every regulatory deliverable.
    expect(await decideAction({ assetId: brief.assetId, versionId: brief.versionId, decision: "approved" })).toMatchObject({ status: 422, error: "expert_ack_required" });
    expect(await decideAction({ assetId: brief.assetId, versionId: brief.versionId, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({ ok: true });

    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "campaign_gtm", campaignId: A.campaign, requestNonce: randomUUID() })).toMatchObject({ ok: true });
    expect(await render(() => CampaignPage(p(A.campaign)))).toEqual({ rendered: true });
    expect((await exportMarkdownAction(brief.assetId)) as { ok: boolean }).toMatchObject({ ok: true });
  });

  it("the strategy brief is linked to the campaign and built on the APPROVED use case map; D–F then receive the approved brief", async () => {
    // Use case map, approved.
    const uc = (await runKind({ kind: "use_case_definition", productId: A.product, market: "DACH" })).details.outputs[0]!;
    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: uc.assetId, versionId: uc.versionId, decision: "approved", expertReviewAcknowledged: true })).toMatchObject({ ok: true });

    const rec = new Recording();
    const { run, details } = await runKind({ kind: "campaign_strategy", campaignId: A.campaign }, () => rec);
    expect(rec.prompts[0]!.user).toContain("<use_case_map>");
    expect(rec.prompts[0]!.user).toMatch(/^communication_channels: LinkedIn, Email, Webinar$/m);
    expect(rec.prompts[0]!.user).toMatch(/^sales_channels: Direct sales, Customer success \(existing customers\)$/m);
    expect((await getDb().asset.findUniqueOrThrow({ where: { id: details.outputs[0]!.assetId } })).campaignId).toBe(A.campaign);
    expect((await getDb().workflowRun.findUniqueOrThrow({ where: { id: run.id } })).campaignId).toBe(A.campaign);

    await approveStrategy(EDITOR_A, A.campaign);
    const pkg = new Recording();
    const gtm = await runKind({ kind: "campaign_gtm", campaignId: A.campaign }, () => pkg);
    expect(gtm.run.status).toBe("completed");
    expect(pkg.prompts).toHaveLength(3);
    for (const pr of pkg.prompts) expect(pr.user).toContain("<gtm_strategy>");
  });

  it("idempotent: the same approved strategy → the same package run; a newly approved strategy → a new run", async () => {
    await approveStrategy(EDITOR_A, A.campaign);
    const o = orchestrator();
    const first = await o.start(EDITOR_A, { kind: "campaign_gtm", campaignId: A.campaign });
    expect((await o.start(EDITOR_A, { kind: "campaign_gtm", campaignId: A.campaign })).run.id).toBe(first.run.id);
    await o.execute(EDITOR_A, first.run.id);
    await approveStrategy(EDITOR_A, A.campaign);
    const second = await o.start(EDITOR_A, { kind: "campaign_gtm", campaignId: A.campaign });
    expect(second.created).toBe(true);
    expect(second.run.id).not.toBe(first.run.id);
  });

  it("a strategy run on another tenant's campaign → 404; viewers cannot start one", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "campaign_strategy", campaignId: B.campaign, requestNonce: randomUUID() })).toMatchObject({ ok: false, status: 404 });
    await expect(orchestrator().start(VIEWER_A, { kind: "campaign_strategy", campaignId: A.campaign })).rejects.toMatchObject({ status: 403 });
  });
});

describe("releases (station 'Release & update')", () => {
  it("an editor plans a release in their own tenant; audited without free text", async () => {
    signInAs(EDITOR_A);
    const res = await createReleaseAction(releaseInput());
    expect(res).toMatchObject({ ok: true });
    const id = (res as { data: { releaseId: string } }).data.releaseId;
    const row = await getDb().release.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ tenantId: DEMO_TENANT_ID, type: "feature_update", salesChannels: ["customer_success"], isSynthetic: false });
    expect(row.plannedOn?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    const audit = await getDb().auditEvent.findFirstOrThrow({ where: { entityType: "Release", entityId: id } });
    expect(audit).toMatchObject({ action: "release.created", actorId: EDITOR_A.userId });
    expect(JSON.stringify(audit.metadata)).not.toContain("Owner reminders");
  });

  it("foreign product id → 404; injected tenantId → 400; viewer 403; anonymous 401", async () => {
    signInAs(EDITOR_A);
    expect(await createReleaseAction(releaseInput({ productId: B.product }))).toMatchObject({ ok: false, status: 404, error: "not_found" });
    expect(await createReleaseAction(releaseInput({ tenantId: OTHER_TENANT_ID }))).toMatchObject({ ok: false, status: 400 });
    await expect(createRelease(VIEWER_A, getDb(), releaseInput())).rejects.toMatchObject({ status: 403 });
    delete jar.userId;
    delete jar.tenantId;
    expect(await createReleaseAction(releaseInput())).toMatchObject({ ok: false, status: 401 });
    expect(await getDb().release.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(1);
  });

  it("release pages: own release renders, the other tenant's release is a 404", async () => {
    signInAs(EDITOR_A);
    expect(await render(() => ReleasesPage())).toEqual({ rendered: true });
    expect(await render(() => ReleasePage(p(A.release)))).toEqual({ rendered: true });
    expect(await render(() => ReleasePage(p(B.release)))).toEqual({ status: 404 });
    expect(await render(() => ReleasePage(p("rel_missing")))).toEqual({ status: 404 });
  });

  it("the release run creates a communication plan linked to the release; planned changes stay planned", async () => {
    const rec = new Recording();
    const { run, details } = await runKind({ kind: "release_communication", releaseId: A.release }, () => rec);
    expect(run).toMatchObject({ status: "completed", inputRefs: { releaseId: A.release, productId: A.product } });
    expect(details.outputs).toEqual([expect.objectContaining({ assetType: "release_communication_plan", assetState: "pending_review", gatesPassed: true })]);
    expect(rec.prompts[0]!.user).toContain("release_type: feature_update");
    expect(rec.prompts[0]!.user).toContain("- [SYNTHETIC] Bulk export of documentation packs");
    const asset = await getDb().asset.findUniqueOrThrow({ where: { id: details.outputs[0]!.assetId } });
    expect(asset).toMatchObject({ releaseId: A.release, campaignId: null });
    expect((await getDb().workflowRun.findUniqueOrThrow({ where: { id: run.id } })).releaseId).toBe(A.release);

    // No regulatory statement → approval without acknowledgement; then export.
    signInAs(REVIEWER_A);
    const out = details.outputs[0]!;
    expect(await decideAction({ assetId: out.assetId, versionId: out.versionId, decision: "approved" })).toMatchObject({ ok: true });
    signInAs(EDITOR_A);
    expect(await exportMarkdownAction(out.assetId)).toMatchObject({ ok: true });
    expect(await render(() => ReleasePage(p(A.release)))).toEqual({ rendered: true });
    expect(await render(() => WorkflowRunPage(p(run.id)))).toEqual({ rendered: true });
  });

  it("a release run on another tenant's release → 404; the database refuses cross-tenant release links", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "release_communication", releaseId: B.release, requestNonce: randomUUID() })).toMatchObject({ ok: false, status: 404 });
    await expect(
      getDb().asset.create({ data: { tenantId: DEMO_TENANT_ID, type: "release_communication_plan", title: "cross-tenant", releaseId: B.release } }),
    ).rejects.toThrow();
  });
});

describe("guided demo and demo reset", () => {
  it("the guided demo renders with the M12 steps", async () => {
    signInAs(EDITOR_A);
    expect(await render(() => DemoPage())).toEqual({ rendered: true });
  });

  it("removes demo releases (after their plans and runs); the seed restores the seeded ones", async () => {
    await createRelease(EDITOR_A, getDb(), releaseInput());
    await runKind({ kind: "release_communication", releaseId: A.release });
    const counts = await resetDemoData(getDb());
    expect(counts.releases).toBeGreaterThanOrEqual(3);
    expect(await getDb().release.count({ where: { tenantId: { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] } } })).toBe(0);
    await seed(getDb(), { password: PASSWORD });
    expect(await getDb().release.findUnique({ where: { id: A.release } })).not.toBeNull();
  });
});
