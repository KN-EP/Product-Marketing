import { describe, expect, it } from "vitest";
import type { Actor } from "@/domain/actor";
import { DomainError } from "@/domain/actor";
import { addVersion, decide, latestApprovedVersion, submitForReview, type AssetRecord } from "@/domain/assets/asset-state";
import { claimsToMarkStale, transitionClaim } from "@/domain/claims/claim-state";
import { exportApprovedMarkdown } from "@/domain/export/markdown";
import { buildSnapshot, type ClaimRecord } from "@/domain/knowledge/snapshot";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { assertWorkflowTransition, idempotencyKey } from "@/domain/workflow/workflow-state";
import {
  DEMO_CLAIMS,
  DEMO_COMPETITOR_EVIDENCE,
  DEMO_SOURCES,
  DEMO_TENANT_ID,
  FOREIGN_CLAIM,
  OTHER_TENANT_ID,
  SIMULATED_BATTLECARD_CORRECTED,
  SIMULATED_BATTLECARD_FLAWED,
  SIMULATED_MESSAGING_FRAMEWORK,
  SIMULATED_REGULATORY_BRIEF,
} from "@/demo/fixtures";

const kb = () =>
  buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: [...DEMO_CLAIMS, FOREIGN_CLAIM], competitorEvidence: DEMO_COMPETITOR_EVIDENCE });

const reviewer: Actor = { kind: "human", userId: "usr_reviewer", tenantId: DEMO_TENANT_ID, role: "reviewer" };
const editor: Actor = { kind: "human", userId: "usr_editor", tenantId: DEMO_TENANT_ID, role: "editor" };
const system: Actor = { kind: "system", userId: null, tenantId: DEMO_TENANT_ID, role: "admin" };
const foreignReviewer: Actor = { kind: "human", userId: "usr_x", tenantId: OTHER_TENANT_ID, role: "admin" };

let n = 0;
const newAsset = (type: AssetRecord["type"], title = "Test asset"): AssetRecord => ({
  id: `ast_${++n}`,
  tenantId: DEMO_TENANT_ID,
  type,
  title,
  state: "draft",
  currentVersionId: null,
  versions: [],
  approvals: [],
});

describe("D — simulated outputs are schema-valid and pass gates", () => {
  it("messaging framework passes", () => {
    const r = runQualityGates("messaging_framework", SIMULATED_MESSAGING_FRAMEWORK, kb());
    expect(r.findings.filter((f) => f.severity === "critical")).toEqual([]);
    expect(r.passed).toBe(true);
  });
  it("regulatory brief passes but requires expert review", () => {
    const r = runQualityGates("regulatory_gtm_brief", SIMULATED_REGULATORY_BRIEF, kb());
    expect(r.findings.filter((f) => f.severity === "critical")).toEqual([]);
    expect(r.requiresExpertReview).toBe(true);
  });
  it("corrected battlecard passes", () => {
    const r = runQualityGates("competitive_battlecard", SIMULATED_BATTLECARD_CORRECTED, kb());
    expect(r.findings.filter((f) => f.severity === "critical")).toEqual([]);
  });
});

describe("Quality gates detect problems", () => {
  it("G1: malformed output fails", () => {
    const r = runQualityGates("messaging_framework", { ...SIMULATED_MESSAGING_FRAMEWORK, pillars: [] }, kb());
    expect(r.passed).toBe(false);
    expect(r.findings[0]!.gate).toBe("G1_schema");
  });
  it("G2: foreign-tenant claim is treated as unknown", () => {
    const out = structuredClone(SIMULATED_MESSAGING_FRAMEWORK);
    out.pillars[0]!.proofPoints[0]!.claimIds = ["clm_foreign"];
    const r = runQualityGates("messaging_framework", out, kb());
    expect(r.findings.some((f) => f.gate === "G2_references_exist" && f.message.includes("clm_foreign"))).toBe(true);
    expect(r.passed).toBe(false);
  });
  it("G3: stale claims block", () => {
    const claims = DEMO_CLAIMS.map((c) => (c.id === "clm_register" ? { ...c, state: "stale" as const } : c));
    const r = runQualityGates("messaging_framework", SIMULATED_MESSAGING_FRAMEWORK, buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims }));
    expect(r.findings.some((f) => f.gate === "G3_claims_approved" && f.message.includes("stale"))).toBe(true);
  });
  it("G4: fabricated excerpt is rejected", () => {
    const out = structuredClone(SIMULATED_REGULATORY_BRIEF);
    out.regulatoryContext.evidence = [{ sourceId: "src_demo_regulatory_summary", excerpt: "fines of up to 35 million euros apply" }];
    const r = runQualityGates("regulatory_gtm_brief", out, kb());
    expect(r.findings.some((f) => f.gate === "G4_excerpts_exist" && f.severity === "critical")).toBe(true);
  });
  it("G5: absolute promise without claim blocks", () => {
    const out = structuredClone(SIMULATED_MESSAGING_FRAMEWORK);
    out.positioningStatement.text = "We guarantee full protection.";
    expect(runQualityGates("messaging_framework", out, kb()).passed).toBe(false);
  });
  it("G7: regulatory statements are detected even if the model did not label them", () => {
    const out = structuredClone(SIMULATED_MESSAGING_FRAMEWORK);
    out.pillars[1]!.message.text = "Helps meet obligations under the AI Act.";
    const r = runQualityGates("messaging_framework", out, kb());
    expect(r.findings.some((f) => f.message === "Model did not label this statement as regulatory")).toBe(true);
  });
  it("G7b: comparative claim without competitor evidence blocks", () => {
    const r = runQualityGates("competitive_battlecard", SIMULATED_BATTLECARD_FLAWED, kb());
    expect(r.findings.some((f) => f.gate === "G7b_comparative_support")).toBe(true);
    expect(r.findings.some((f) => f.gate === "G3_claims_approved")).toBe(true);
    expect(r.passed).toBe(false);
  });
});

describe("E — an unsupported critical claim cannot pass approval", () => {
  it("decide(approved) throws gates_failed", () => {
    let a = newAsset("competitive_battlecard");
    a = addVersion(a, SIMULATED_BATTLECARD_FLAWED, system, kb(), { id: "v1", generationMode: "simulated" });
    a = submitForReview(a, editor);
    expect(() => decide(a, reviewer, kb(), { versionId: "v1", decision: "approved" })).toThrowError(/critical finding/);
  });
  it("a claim that became stale after generation blocks approval at decision time", () => {
    let a = newAsset("messaging_framework");
    a = addVersion(a, SIMULATED_MESSAGING_FRAMEWORK, system, kb(), { id: "v1", generationMode: "simulated" });
    expect(a.versions[0]!.gatesPassed).toBe(true);
    a = submitForReview(a, editor);
    const staleKb = buildSnapshot({
      tenantId: DEMO_TENANT_ID,
      sources: DEMO_SOURCES,
      claims: DEMO_CLAIMS.map((c) => (c.id === "clm_doc_pack" ? { ...c, state: "stale" as const } : c)),
    });
    expect(() => decide(a, reviewer, staleKb, { versionId: "v1", decision: "approved" })).toThrow(DomainError);
  });
  it("an LLM-supplied approval field is ignored", () => {
    let a = newAsset("competitive_battlecard");
    a = addVersion(a, { ...SIMULATED_BATTLECARD_FLAWED, status: "approved", approved: true }, system, kb(), { id: "v1", generationMode: "simulated" });
    expect(a.state).toBe("draft");
    expect(a.versions[0]!.gatesPassed).toBe(false);
  });
});

describe("F — reject, request changes, approve corrected version", () => {
  it("full review loop", () => {
    let a = newAsset("competitive_battlecard", "Battlecard");
    a = addVersion(a, SIMULATED_BATTLECARD_FLAWED, system, kb(), { id: "v1", generationMode: "simulated" });
    a = submitForReview(a, editor);
    expect(() => decide(a, reviewer, kb(), { versionId: "v1", decision: "changes_requested" })).toThrow(/comment is required/);
    a = decide(a, reviewer, kb(), { versionId: "v1", decision: "rejected", comment: "Unsupported comparison" }).asset;
    expect(a.state).toBe("draft");
    a = submitForReview(a, editor);
    a = decide(a, reviewer, kb(), { versionId: "v1", decision: "changes_requested", comment: "Use approved competitor evidence" }).asset;
    expect(a.state).toBe("changes_requested");

    a = addVersion(a, SIMULATED_BATTLECARD_CORRECTED, editor, kb(), { id: "v2", generationMode: "simulated" });
    a = submitForReview(a, editor);
    expect(() => decide(a, reviewer, kb(), { versionId: "v1", decision: "approved" })).toThrow(/current version/);
    a = decide(a, reviewer, kb(), { versionId: "v2", decision: "approved" }).asset;
    expect(a.state).toBe("approved");
    expect(a.approvals.map((x) => x.decision)).toEqual(["rejected", "changes_requested", "approved"]);
  });
  it("editors and system actors cannot approve", () => {
    let a = newAsset("messaging_framework");
    a = submitForReview(addVersion(a, SIMULATED_MESSAGING_FRAMEWORK, system, kb(), { id: "v1", generationMode: "simulated" }), editor);
    expect(() => decide(a, editor, kb(), { versionId: "v1", decision: "approved" })).toThrow(/human reviewer/);
    expect(() => decide(a, system, kb(), { versionId: "v1", decision: "approved" })).toThrow(/human reviewer/);
  });
  it("regulatory assets need expert acknowledgement", () => {
    let a = newAsset("regulatory_gtm_brief");
    a = submitForReview(addVersion(a, SIMULATED_REGULATORY_BRIEF, system, kb(), { id: "v1", generationMode: "simulated" }), editor);
    expect(() => decide(a, reviewer, kb(), { versionId: "v1", decision: "approved" })).toThrow(/expert review/);
    expect(decide(a, reviewer, kb(), { versionId: "v1", decision: "approved", expertReviewAcknowledged: true }).asset.state).toBe("approved");
  });
  it("approved versions are immutable; edits create a new draft", () => {
    let a = newAsset("messaging_framework");
    a = submitForReview(addVersion(a, SIMULATED_MESSAGING_FRAMEWORK, system, kb(), { id: "v1", generationMode: "simulated" }), editor);
    // Positioning mentions the EU AI Act → expert acknowledgement is mandatory.
    expect(a.versions[0]!.gateReport.requiresExpertReview).toBe(true);
    a = decide(a, reviewer, kb(), { versionId: "v1", decision: "approved", expertReviewAcknowledged: true }).asset;
    const v1 = a.versions[0]!;
    expect(() => {
      (v1.content as { positioningStatement: { text: string } }).positioningStatement.text = "tampered";
    }).toThrow(TypeError);
    a = addVersion(a, { ...SIMULATED_MESSAGING_FRAMEWORK }, editor, kb(), { id: "v2", generationMode: "simulated" });
    expect(a.state).toBe("draft");
    expect(latestApprovedVersion(a)!.version.id).toBe("v1");
  });
});

describe("G — export of approved assets", () => {
  it("exports version, approval and source references; refuses drafts", () => {
    let a = newAsset("messaging_framework", "Messaging Framework — AI Governance (CISO, DE)");
    a = addVersion(a, SIMULATED_MESSAGING_FRAMEWORK, system, kb(), { id: "v1", generationMode: "simulated" });
    expect(() => exportApprovedMarkdown(a, reviewer, kb(), () => "R")).toThrow(/no approved version/);
    a = decide(submitForReview(a, editor), reviewer, kb(), { versionId: "v1", decision: "approved", expertReviewAcknowledged: true, now: new Date("2026-10-19T10:00:00Z") }).asset;
    const md = exportApprovedMarkdown(a, reviewer, kb(), () => "Rita Reviewer");
    expect(md).toContain("| Version | v1 (v1) |");
    expect(md).toContain("Rita Reviewer");
    expect(md).toContain("SIMULATED");
    expect(md).toContain("claim:clm_register");
    expect(md).toContain("`src_demo_product_overview`");
    expect(md).toContain("[FACT]");
    expect(md).toContain("[SUGGESTION]");
  });
});

describe("H — tenant isolation in the domain layer", () => {
  it("snapshot drops foreign records", () => {
    expect(kb().claims.has("clm_foreign")).toBe(false);
  });
  it("foreign actors cannot act on or export another tenant's asset", () => {
    let a = newAsset("messaging_framework");
    a = submitForReview(addVersion(a, SIMULATED_MESSAGING_FRAMEWORK, system, kb(), { id: "v1", generationMode: "simulated" }), editor);
    expect(() => decide(a, foreignReviewer, kb(), { versionId: "v1", decision: "approved" })).toThrow(/not found/);
    expect(() => exportApprovedMarkdown(a, foreignReviewer, kb(), () => "")).toThrow(/not found/);
    expect(() => transitionClaim(DEMO_CLAIMS[0]!, "draft", foreignReviewer, kb())).toThrow(/not found/);
  });
});

describe("Claims", () => {
  const pending: ClaimRecord = { ...DEMO_CLAIMS[0]!, id: "clm_p", state: "pending_review" };
  it("cannot be approved without evidence", () => {
    expect(() => transitionClaim({ ...pending, evidence: [] }, "approved", reviewer, kb())).toThrow(/no evidence/);
  });
  it("cannot be approved with an excerpt that is not in the source", () => {
    expect(() =>
      transitionClaim({ ...pending, evidence: [{ sourceId: "src_demo_product_overview", excerpt: "is ISO 42001 certified worldwide" }] }, "approved", reviewer, kb()),
    ).toThrow(/Excerpt not found/);
  });
  it("can be approved by a reviewer with valid evidence; reviewer and timestamps recorded", () => {
    const now = new Date("2026-10-19T09:00:00Z");
    const r = transitionClaim(pending, "approved", reviewer, kb(), { now });
    expect(r.claim.state).toBe("approved");
    expect(r.reviewerId).toBe("usr_reviewer");
    expect(r.approvedAt).toEqual(now);
    expect(r.audit.action).toBe("claim.approved");
  });
  it("editors cannot approve", () => {
    expect(() => transitionClaim(pending, "approved", editor, kb())).toThrow(/human reviewer/);
  });
  it("a changed source marks dependent claims stale, others untouched", () => {
    const stale = claimsToMarkStale("src_demo_product_overview", DEMO_CLAIMS);
    expect(stale.map((c) => c.id).sort()).toEqual(["clm_doc_pack", "clm_register", "clm_risk_owner"]);
    expect(stale.every((c) => c.state === "stale")).toBe(true);
  });
});

describe("Workflow", () => {
  it("enforces status transitions", () => {
    expect(() => assertWorkflowTransition("created", "running")).toThrow();
    expect(() => assertWorkflowTransition("completed", "running")).toThrow();
    expect(() => assertWorkflowTransition("validation", "pending_review")).not.toThrow();
  });
  it("idempotency key is stable and order-insensitive", async () => {
    const base = { tenantId: DEMO_TENANT_ID, kind: "pmm_three_asset", productId: "p", personaId: "ciso", market: "DE", regulatoryTriggerId: "euaiact", promptVersions: { b: "1", a: "1" } };
    const k1 = await idempotencyKey({ ...base, competitorIds: ["a", "b", "c"] });
    const k2 = await idempotencyKey({ ...base, competitorIds: ["c", "a", "b"], promptVersions: { a: "1", b: "1" } });
    const k3 = await idempotencyKey({ ...base, competitorIds: ["a", "b", "c"], tenantId: OTHER_TENANT_ID });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
