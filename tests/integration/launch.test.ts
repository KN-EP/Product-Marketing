/**
 * M15 station "Launch" against a REAL Postgres (TEST_DATABASE_URL), simulated
 * LLM mode only: launch briefings, computed readiness, the launch plan run,
 * go / no-go rules, proof updates — plus tenant isolation of every new entry point.
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

import LaunchesPage from "@/app/(app)/launches/page";
import LaunchPage from "@/app/(app)/launches/[id]/page";
import DemoPage from "@/app/(app)/demo/page";
import { createLaunchAction, decideLaunchPhaseAction, updateLaunchProofAction } from "@/app/actions/launch";
import { decideAction } from "@/app/actions/review";
import { startWorkflowAction } from "@/app/actions/workflow";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { resetDemoData } from "@/server/demo/reset";
import { resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import { createLaunch, decideLaunchPhase, launchReadiness, updateLaunchProof } from "@/server/launches/service";
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
  await db.launch.deleteMany({ where: { tenantId: tenants, isSynthetic: false } });
  await db.launchDecision.deleteMany({ where: { tenantId: tenants } });
  // Restores the seeded launches (proof) after an update.
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

const p = (id: string) => ({ params: Promise.resolve({ id }) });
const launchInput = (over: Record<string, unknown> = {}) => ({
  productId: A.product,
  name: "Bulk export launch",
  tier: "tier_2",
  summary: "Bulk export of documentation packs for all customers.",
  pricingModel: "Included in all plans",
  targetSegments: "Existing register customers",
  generalAvailabilityOn: "2027-03-01",
  customerLaunchOn: "2027-03-15",
  externalReferences: 0,
  internalPilot: false,
  ...over,
});
const decide = (over: Record<string, unknown>) => decideLaunchPhaseAction({ launchId: A.launch, phase: "early_access", decision: "go", ...over });

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

async function approvedPlan() {
  const { run, details } = await runKind({ kind: "launch_planning", launchId: A.launch });
  const out = details.outputs[0]!;
  signInAs(REVIEWER_A);
  expect(await decideAction({ assetId: out.assetId, versionId: out.versionId, decision: "approved" })).toMatchObject({ ok: true });
  return { run, out };
}

describe("launch pages and briefing (M15)", () => {
  it("own launch renders, the other tenant's launch and a missing id are 404; list and demo render", async () => {
    signInAs(EDITOR_A);
    expect(await render(() => LaunchesPage())).toEqual({ rendered: true });
    expect(await render(() => LaunchPage(p(A.launch)))).toEqual({ rendered: true });
    expect(await render(() => LaunchPage(p(B.launch)))).toEqual({ status: 404 });
    expect(await render(() => LaunchPage(p("lnc_missing")))).toEqual({ status: 404 });
    expect(await render(() => DemoPage())).toEqual({ rendered: true });
  });

  it("an editor plans a launch; audited without free text; foreign product/release → 404; injected tenantId → 400; viewer 403; anonymous 401", async () => {
    signInAs(EDITOR_A);
    const res = await createLaunchAction(launchInput({ releaseId: A.release }));
    expect(res).toMatchObject({ ok: true });
    const id = (res as { data: { launchId: string } }).data.launchId;
    expect(await getDb().launch.findUniqueOrThrow({ where: { id } })).toMatchObject({ tenantId: DEMO_TENANT_ID, releaseId: A.release, tier: "tier_2" });
    const audit = await getDb().auditEvent.findFirstOrThrow({ where: { entityType: "Launch", entityId: id } });
    expect(audit).toMatchObject({ action: "launch.created" });
    expect(JSON.stringify(audit.metadata)).not.toContain("Bulk export");

    expect(await createLaunchAction(launchInput({ productId: B.product }))).toMatchObject({ ok: false, status: 404 });
    expect(await createLaunchAction(launchInput({ releaseId: B.release }))).toMatchObject({ ok: false, status: 404 });
    expect(await createLaunchAction(launchInput({ tenantId: OTHER_TENANT_ID }))).toMatchObject({ ok: false, status: 400 });
    expect(await createLaunchAction(launchInput({ generalAvailabilityOn: "2027-04-01" }))).toMatchObject({ ok: false, status: 400 });
    await expect(createLaunch(VIEWER_A, getDb(), launchInput())).rejects.toMatchObject({ status: 403 });
    delete jar.userId;
    delete jar.tenantId;
    expect(await createLaunchAction(launchInput())).toMatchObject({ ok: false, status: 401 });
  });
});

describe("launch plan run", () => {
  it("creates a launch plan linked to the launch with the computed readiness; the plan cannot check itself", async () => {
    const rec = new Recording();
    const { run, details } = await runKind({ kind: "launch_planning", launchId: A.launch }, () => rec);
    expect(run).toMatchObject({ status: "completed", inputRefs: { launchId: A.launch, productId: A.product } });
    expect(details.outputs).toEqual([expect.objectContaining({ assetType: "launch_plan", assetState: "pending_review", gatesPassed: true })]);
    expect(rec.prompts[0]!.user).toContain("decided by people, not by you");
    expect(rec.prompts[0]!.user).toContain("- market_launch");
    const asset = await getDb().asset.findUniqueOrThrow({ where: { id: details.outputs[0]!.assetId } });
    expect(asset.launchId).toBe(A.launch);
    expect((await getDb().workflowRun.findUniqueOrThrow({ where: { id: run.id } })).launchId).toBe(A.launch);
    const v = await getDb().assetVersion.findUniqueOrThrow({ where: { id: details.outputs[0]!.versionId } });
    const readiness = (v.content as { readiness: { phases: { phase: string; status: string; checks: { id: string; status: string }[] }[] } }).readiness;
    expect(readiness.phases.every((ph) => ph.checks.find((c) => c.id === "launch_plan_approved")!.status === "na")).toBe(true);
    expect(readiness.phases.find((ph) => ph.phase === "market_launch")!.status).toBe("no_go");
    const report = v.gateReport as { findings: { gate: string; severity: string }[] };
    expect(report.findings.some((f) => f.gate === "G16_launch_readiness" && f.severity === "warning")).toBe(true);
  });

  it("a launch run on another tenant's launch → 404; the database refuses cross-tenant launch links", async () => {
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "launch_planning", launchId: B.launch, requestNonce: randomUUID() })).toMatchObject({ ok: false, status: 404 });
    await expect(getDb().asset.create({ data: { tenantId: DEMO_TENANT_ID, type: "launch_plan", title: "x", launchId: B.launch } })).rejects.toThrow();
  });

  it("idempotent until the briefing changes (proof update → new run)", async () => {
    const o = orchestrator();
    const first = await o.start(EDITOR_A, { kind: "launch_planning", launchId: A.launch });
    expect((await o.start(EDITOR_A, { kind: "launch_planning", launchId: A.launch })).run.id).toBe(first.run.id);
    await o.execute(EDITOR_A, first.run.id);
    await updateLaunchProof(EDITOR_A, getDb(), { launchId: A.launch, externalReferences: 1, internalPilot: true });
    expect((await o.start(EDITOR_A, { kind: "launch_planning", launchId: A.launch })).created).toBe(true);
  });
});

describe("go / no-go", () => {
  it("go is refused while a required check fails (audited); a plan approval unlocks early access", async () => {
    signInAs(REVIEWER_A);
    expect(await decide({})).toMatchObject({ ok: false, status: 409, error: "readiness_no_go" });
    expect(await getDb().auditEvent.count({ where: { entityId: A.launch, action: "launch.go_blocked" } })).toBe(1);

    await approvedPlan();
    signInAs(REVIEWER_A);
    // Messaging not approved → early access is "ready with risks": go needs acknowledgement + comment.
    expect(await decide({})).toMatchObject({ ok: false, status: 422, error: "risk_ack_required" });
    expect(await decide({ risksAcknowledged: true, comment: "Early access only with existing customers; messaging follows." })).toMatchObject({
      ok: true,
      data: { status: "go_with_risks" },
    });
    const d = await getDb().launchDecision.findFirstOrThrow({ where: { launchId: A.launch } });
    expect(d).toMatchObject({ phase: "early_access", decision: "go", decidedById: REVIEWER_A.userId });
    expect(d.readiness).toMatchObject({ phase: "early_access", status: "go_with_risks" });

    // GA needs approved messaging; market launch needs an external reference.
    expect(await decide({ phase: "general_availability" })).toMatchObject({ ok: false, status: 409, error: "readiness_no_go" });
    expect(await decide({ phase: "market_launch" })).toMatchObject({ ok: false, status: 409, error: "readiness_no_go" });
    // No-go always possible, with a reason.
    expect(await decide({ phase: "market_launch", decision: "no_go" })).toMatchObject({ ok: false, status: 422, error: "comment_required" });
    expect(await decide({ phase: "market_launch", decision: "no_go", comment: "No external reference yet — earn it in early access." })).toMatchObject({ ok: true });
  });

  it("a later phase needs go for every earlier planned phase", async () => {
    const res = await createLaunch(EDITOR_A, getDb(), launchInput({ tier: "tier_3", earlyAccessOn: "2027-02-01" }));
    await runKind({ kind: "launch_planning", launchId: res.launchId });
    const plan = await getDb().asset.findFirstOrThrow({ where: { launchId: res.launchId }, include: { versions: true } });
    signInAs(REVIEWER_A);
    await decideAction({ assetId: plan.id, versionId: plan.versions[0]!.id, decision: "approved" });
    const { readiness } = await launchReadiness(tenantDb(REVIEWER_A, getDb()), res.launchId);
    expect(readiness.phases.find((x) => x.phase === "general_availability")!.status).toBe("go_with_risks");
    const go = (phase: string) => decideLaunchPhaseAction({ launchId: res.launchId, phase, decision: "go", risksAcknowledged: true, comment: "Tier 3, quiet availability." });
    expect(await go("general_availability")).toMatchObject({ ok: false, status: 409, error: "phase_order" });
    expect(await go("early_access")).toMatchObject({ ok: true });
    expect(await go("general_availability")).toMatchObject({ ok: true });
  });

  it("editors cannot decide (403); a foreign launch → 404; the other tenant's reviewer cannot touch this launch", async () => {
    await expect(decideLaunchPhase(EDITOR_A, getDb(), { launchId: A.launch, phase: "early_access", decision: "go" })).rejects.toMatchObject({ status: 403 });
    signInAs(REVIEWER_A);
    expect(await decide({ launchId: B.launch })).toMatchObject({ ok: false, status: 404 });
    signInAs(REVIEWER_B);
    expect(await decide({ decision: "no_go", comment: "cross-tenant attempt" })).toMatchObject({ ok: false, status: 404 });
    expect(await getDb().launchDecision.count({ where: { launchId: A.launch } })).toBe(0);
  });
});

describe("proof", () => {
  it("references change the market check; viewers cannot update proof; foreign launch → 404", async () => {
    const tdb = tenantDb(EDITOR_A, getDb());
    const before = (await launchReadiness(tdb, A.launch)).readiness.phases.find((x) => x.phase === "market_launch")!;
    expect(before.checks.find((c) => c.id === "external_references")!.status).toBe("fail");
    signInAs(EDITOR_A);
    expect(await updateLaunchProofAction({ launchId: A.launch, externalReferences: 2, internalPilot: true })).toMatchObject({ ok: true });
    const after = (await launchReadiness(tdb, A.launch)).readiness.phases.find((x) => x.phase === "market_launch")!;
    expect(after.checks.find((c) => c.id === "external_references")!.status).toBe("pass");
    expect(await updateLaunchProofAction({ launchId: B.launch, externalReferences: 1, internalPilot: true })).toMatchObject({ ok: false, status: 404 });
    await expect(updateLaunchProof(VIEWER_A, getDb(), { launchId: A.launch, externalReferences: 5, internalPilot: true })).rejects.toMatchObject({ status: 403 });
  });
});

describe("demo reset", () => {
  it("removes demo launches (after plans and runs) and their decisions; the seed restores the seeded ones", async () => {
    await approvedPlan();
    signInAs(REVIEWER_A);
    await decide({ decision: "no_go", comment: "Reset test decision." });
    const counts = await resetDemoData(getDb());
    expect(counts.launches).toBeGreaterThanOrEqual(2);
    expect(await getDb().launch.count({ where: { tenantId: { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] } } })).toBe(0);
    expect(await getDb().launchDecision.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(0);
    await seed(getDb(), { password: PASSWORD });
    expect(await getDb().launch.findUnique({ where: { id: A.launch } })).not.toBeNull();
  });
});
