/**
 * M14 "Win/loss & research" against a REAL Postgres (TEST_DATABASE_URL),
 * simulated LLM mode only: interviews with consent, the synthesis run with
 * computed statistics, consent withdrawal (notes erased, approval no longer
 * exportable) — plus tenant isolation of every new entry point.
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

import ResearchPage from "@/app/(app)/research/page";
import DemoPage from "@/app/(app)/demo/page";
import { recordInterviewAction, withdrawConsentAction } from "@/app/actions/research";
import { decideAction, exportMarkdownAction } from "@/app/actions/review";
import { startWorkflowAction } from "@/app/actions/workflow";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { resetDemoData } from "@/server/demo/reset";
import { resetRateLimits } from "@/server/http/rate-limit";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import { recordInterview, withdrawConsent } from "@/server/research/service";
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

const SEEDED_ASSETS = [A.asset, B.asset];
async function resetData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.approval.deleteMany({ where: { tenantId: tenants, assetVersion: { assetId: { notIn: SEEDED_ASSETS } } } });
  await db.assetVersion.deleteMany({ where: { tenantId: tenants, assetId: { notIn: SEEDED_ASSETS } } });
  await db.asset.deleteMany({ where: { tenantId: tenants, id: { notIn: SEEDED_ASSETS } } });
  await db.workflowRun.deleteMany({ where: { tenantId: tenants } });
  await db.winLossInterview.deleteMany({ where: { tenantId: tenants, isSynthetic: false } });
  await db.source.deleteMany({ where: { tenantId: tenants, kind: "interview", isSynthetic: false } });
  // Restores the seeded interviews (consent, notes, source status) after a withdrawal.
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

const interviewInput = (over: Record<string, unknown> = {}) => ({
  productId: A.product,
  accountLabel: "Mid-sized chemicals company G",
  segment: "Regulated mid-market",
  outcome: "lost",
  competitorId: A.competitors[1],
  reasons: ["existing_system", "integrations"],
  primaryReason: "existing_system",
  consentStatus: "granted",
  notes: "Group IT insisted on the existing GRC suite; the ticketing connector was missing as well.",
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

describe("seeded interviews (M14)", () => {
  it("each tenant sees only its own interviews; notes live in confidential interview sources", async () => {
    const own = await tenantDb(EDITOR_A, getDb()).views.interviews();
    expect(own.map((i) => i.id).sort()).toEqual(["wli_demo_a", "wli_demo_b", "wli_demo_c", "wli_demo_d", "wli_demo_e", "wli_demo_f"]);
    const other = await tenantDb(EDITOR_B, getDb()).views.interviews();
    expect(other.map((i) => i.id)).toEqual([B.interview]);
    const src = await getDb().source.findUniqueOrThrow({ where: { id: "src_wli_demo_a" } });
    expect(src).toMatchObject({ kind: "interview", classification: "confidential", status: "active" });
    expect((await getDb().winLossInterview.findUniqueOrThrow({ where: { id: "wli_demo_f" } })).sourceId).toBeNull();
  });

  it("the research page renders for every role; the demo page renders with the M14 steps", async () => {
    for (const a of [EDITOR_A, VIEWER_A]) {
      signInAs(a);
      expect(await render(() => ResearchPage())).toEqual({ rendered: true });
    }
    expect(await render(() => DemoPage())).toEqual({ rendered: true });
  });
});

describe("recording interviews", () => {
  it("with consent: the notes become a confidential interview source; the audit carries no label or notes", async () => {
    signInAs(EDITOR_A);
    const res = await recordInterviewAction(interviewInput());
    expect(res).toMatchObject({ ok: true });
    const { interviewId, sourceId } = (res as { data: { interviewId: string; sourceId: string } }).data;
    const row = await getDb().winLossInterview.findUniqueOrThrow({ where: { id: interviewId } });
    expect(row).toMatchObject({ tenantId: DEMO_TENANT_ID, consentStatus: "granted", sourceId, isSynthetic: false });
    expect(await getDb().source.findUniqueOrThrow({ where: { id: sourceId } })).toMatchObject({
      tenantId: DEMO_TENANT_ID,
      kind: "interview",
      classification: "confidential",
      status: "active",
    });
    const audit = await getDb().auditEvent.findFirstOrThrow({ where: { entityType: "WinLossInterview", entityId: interviewId } });
    expect(audit).toMatchObject({ action: "interview.recorded", actorId: EDITOR_A.userId });
    const meta = JSON.stringify(audit.metadata);
    expect(meta).not.toContain("chemicals");
    expect(meta).not.toContain("GRC suite");
  });

  it("without consent: no notes, no source; notes without consent and contact data are refused", async () => {
    signInAs(EDITOR_A);
    const res = await recordInterviewAction(interviewInput({ consentStatus: "requested", notes: undefined }));
    expect(res).toMatchObject({ ok: true, data: { sourceId: null } });
    expect(await recordInterviewAction(interviewInput({ consentStatus: "declined" }))).toMatchObject({ ok: false, status: 400 });
    expect(await recordInterviewAction(interviewInput({ notes: "Reach the CISO at ciso@example.com for the follow-up call." }))).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("foreign product or competitor → 404; injected tenantId → 400; viewer 403; anonymous 401 — nothing stored", async () => {
    const before = await getDb().winLossInterview.count({ where: { tenantId: DEMO_TENANT_ID } });
    const sourcesBefore = await getDb().source.count({ where: { tenantId: DEMO_TENANT_ID } });
    signInAs(EDITOR_A);
    expect(await recordInterviewAction(interviewInput({ productId: B.product }))).toMatchObject({ ok: false, status: 404, error: "not_found" });
    expect(await recordInterviewAction(interviewInput({ competitorId: B.competitors[0] }))).toMatchObject({ ok: false, status: 404 });
    expect(await recordInterviewAction(interviewInput({ tenantId: OTHER_TENANT_ID }))).toMatchObject({ ok: false, status: 400 });
    await expect(recordInterview(VIEWER_A, getDb(), interviewInput())).rejects.toMatchObject({ status: 403 });
    delete jar.userId;
    delete jar.tenantId;
    expect(await recordInterviewAction(interviewInput())).toMatchObject({ ok: false, status: 401 });
    expect(await getDb().winLossInterview.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(before);
    expect(await getDb().source.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(sourcesBefore);
  });
});

describe("win/loss synthesis run", () => {
  it("computes the stats in code, uses only this product's consented interview sources, lands in review and passes the gates", async () => {
    const rec = new Recording();
    const { run, details } = await runKind({ kind: "win_loss_synthesis", productId: A.product }, () => rec);
    expect(run).toMatchObject({ status: "completed", inputRefs: { productId: A.product } });
    expect(details.outputs).toEqual([expect.objectContaining({ assetType: "win_loss_synthesis", assetState: "pending_review", gatesPassed: true })]);
    const user = rec.prompts[0]!.user;
    expect(user).toContain('<source id="src_wli_demo_a"');
    expect(user).not.toContain("src_wli_other_a");
    expect(user).toContain("excluded_without_consent: 1");
    const v = await getDb().assetVersion.findUniqueOrThrow({ where: { id: details.outputs[0]!.versionId } });
    expect(v.content).toMatchObject({ stats: { interviews: 5, won: 2, lost: 3, winRatePct: 40, excludedWithoutConsent: 1 } });
  });

  it("other runs never see interview notes in their prompts", async () => {
    const rec = new Recording();
    await runKind({ kind: "release_communication", releaseId: A.release }, () => rec);
    expect(rec.prompts[0]!.user).not.toContain("SYNTHETIC DEMO INTERVIEW");
    expect(rec.prompts[0]!.user).not.toContain("src_wli_demo_a");
  });

  it("needs ≥ 3 consented interviews (409); a foreign product → 404; idempotent until the interviews change", async () => {
    signInAs(EDITOR_B);
    expect(await startWorkflowAction({ kind: "win_loss_synthesis", productId: B.product })).toMatchObject({ ok: false, status: 409, error: "not_enough_interviews" });
    signInAs(EDITOR_A);
    expect(await startWorkflowAction({ kind: "win_loss_synthesis", productId: B.product })).toMatchObject({ ok: false, status: 404 });

    const o = orchestrator();
    const first = await o.start(EDITOR_A, { kind: "win_loss_synthesis", productId: A.product });
    const again = await o.start(EDITOR_A, { kind: "win_loss_synthesis", productId: A.product });
    expect(again).toMatchObject({ created: false, run: { id: first.run.id } });
    await o.execute(EDITOR_A, first.run.id);
    await recordInterview(EDITOR_A, getDb(), interviewInput());
    const changed = await o.start(EDITOR_A, { kind: "win_loss_synthesis", productId: A.product });
    expect(changed.created).toBe(true);
    expect(changed.run.id).not.toBe(first.run.id);
  });
});

describe("consent withdrawn", () => {
  it("erases the notes, invalidates the source and blocks the export of an approval that cited it", async () => {
    const { details } = await runKind({ kind: "win_loss_synthesis", productId: A.product });
    const out = details.outputs[0]!;
    signInAs(REVIEWER_A);
    expect(await decideAction({ assetId: out.assetId, versionId: out.versionId, decision: "approved" })).toMatchObject({ ok: true });
    signInAs(EDITOR_A);
    expect(await exportMarkdownAction(out.assetId)).toMatchObject({ ok: true });

    expect(await withdrawConsentAction("wli_demo_a")).toMatchObject({ ok: true });
    const src = await getDb().source.findUniqueOrThrow({ where: { id: "src_wli_demo_a" } });
    expect(src.status).toBe("invalid");
    expect(src.content).not.toContain("risk assessment");
    expect((await getDb().winLossInterview.findUniqueOrThrow({ where: { id: "wli_demo_a" } })).consentStatus).toBe("withdrawn");

    expect(await exportMarkdownAction(out.assetId)).toMatchObject({ ok: false, status: 409, error: "approval_outdated" });
    expect(await getDb().auditEvent.count({ where: { entityId: out.assetId, action: "asset.export_blocked" } })).toBe(1);
    expect(await withdrawConsentAction("wli_demo_a")).toMatchObject({ ok: false, status: 409, error: "already_withdrawn" });

    // A new synthesis leaves the withdrawn interview out.
    const rec = new Recording();
    const next = await runKind({ kind: "win_loss_synthesis", productId: A.product }, () => rec);
    expect(rec.prompts[0]!.user).not.toContain('<source id="src_wli_demo_a"');
    const v = await getDb().assetVersion.findUniqueOrThrow({ where: { id: next.details.outputs[0]!.versionId } });
    expect(v.content).toMatchObject({ stats: { interviews: 4, excludedWithoutConsent: 2 } });
    expect(next.details.outputs[0]!.gatesPassed).toBe(true);
  });

  it("a foreign interview id → 404; viewers cannot withdraw (403)", async () => {
    signInAs(EDITOR_A);
    expect(await withdrawConsentAction(B.interview)).toMatchObject({ ok: false, status: 404 });
    await expect(withdrawConsent(VIEWER_A, getDb(), "wli_demo_b")).rejects.toMatchObject({ status: 403 });
    expect((await getDb().winLossInterview.findUniqueOrThrow({ where: { id: B.interview } })).consentStatus).toBe("granted");
  });
});

describe("demo reset", () => {
  it("removes demo interviews and their sources; the seed restores the seeded ones", async () => {
    await recordInterview(EDITOR_A, getDb(), interviewInput());
    const counts = await resetDemoData(getDb());
    expect(counts.interviews).toBeGreaterThanOrEqual(8);
    expect(await getDb().winLossInterview.count({ where: { tenantId: { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] } } })).toBe(0);
    expect(await getDb().source.count({ where: { tenantId: DEMO_TENANT_ID, kind: "interview" } })).toBe(0);
    await seed(getDb(), { password: PASSWORD });
    expect(await getDb().winLossInterview.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(6);
  });
});
