/** M16 regulatory radar: input rules, deadline tokens, deterministic impact analysis, simulated change brief. */
import { describe, expect, it } from "vitest";
import { DEMO_CLAIMS, DEMO_SOURCES, DEMO_TENANT_ID, SIMULATED_REGULATORY_BRIEF, SIMULATED_MESSAGING_FRAMEWORK } from "@/demo/fixtures";
import { DEMO_PREPARED_CHANGE, simulatedChangeBrief } from "@/demo/regulatory-fixtures";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { analyseImpact, changeBriefNotes, deadlineTokens, RecordChangeInput } from "@/domain/regulatory/radar";
import { RegulatoryChangeBriefV1 } from "@/domain/schemas/regulatory";
import { AGENT_REGULATORY_CHANGE_PROMPT, renderPrompt } from "@/server/prompts";

const SRC = "src_demo_regulatory_summary";
const S = (text: string, extra: Record<string, unknown> = {}) => ({ text, kind: "suggestion", claimIds: [], evidence: [], competitorEvidenceIds: [], kpiRefs: [], regulatory: false, comparative: false, ...extra });

describe("record change input", () => {
  it("needs the new wording; a deadline shift needs the new deadline; unknown keys are rejected", () => {
    expect(RecordChangeInput.safeParse(DEMO_PREPARED_CHANGE).success).toBe(true);
    expect(RecordChangeInput.safeParse({ ...DEMO_PREPARED_CHANGE, newDeadline: "" }).success).toBe(false);
    expect(RecordChangeInput.safeParse({ ...DEMO_PREPARED_CHANGE, kind: "new_guidance", newDeadline: "" }).success).toBe(true);
    expect(RecordChangeInput.safeParse({ ...DEMO_PREPARED_CHANGE, updatedSourceText: "short" }).success).toBe(false);
    expect(RecordChangeInput.safeParse({ ...DEMO_PREPARED_CHANGE, tenantId: "x" }).success).toBe(false);
  });
});

describe("deadline tokens", () => {
  it("covers ISO, German and English spellings", () => {
    const t = deadlineTokens("2026-08-02");
    for (const x of ["2026-08-02", "02.08.2026", "2.8.2026", "2 August 2026", "August 2, 2026", "2. August 2026", "August 2026"]) expect(t).toContain(x);
    expect(deadlineTokens("2027-03-01")).toContain("März 2027");
    expect(deadlineTokens(null)).toEqual([]);
  });
});

describe("impact analysis (deterministic)", () => {
  const asset = (assetId: string, content: unknown, state = "approved") => ({ assetId, title: assetId, state, versions: [{ versionId: `${assetId}_v1`, content }] });
  const impact = analyseImpact({
    sourceId: SRC,
    tenantId: DEMO_TENANT_ID,
    newContent: DEMO_PREPARED_CHANGE.updatedSourceText,
    previousDeadline: "2026-08-02",
    claims: DEMO_CLAIMS,
    assets: [
      asset("regulatory_brief", SIMULATED_REGULATORY_BRIEF),
      asset("uses_claim", { a: S("Act before the deadline.", { claimIds: ["clm_reg_high_risk_date"] }) }),
      asset("old_quote", { a: S("x", { kind: "fact", regulatory: true, evidence: [{ sourceId: SRC, excerpt: "obligations for high-risk AI systems apply from 2 August 2026" }] }) }),
      asset("mentions_date", { a: S("Obligations start in August 2026 — prepare now.") }, "pending_review"),
      asset("unrelated", SIMULATED_MESSAGING_FRAMEWORK),
    ],
  });

  it("the claim citing the changed source becomes stale — not the product claims", () => {
    expect(impact.staleClaimIds).toEqual(["clm_reg_high_risk_date"]);
  });

  it("flags each asset with its reasons; unchanged excerpts are only 'cites the changed source'; unrelated assets are not flagged", () => {
    const by = Object.fromEntries(impact.affectedAssets.map((a) => [a.assetId, a.reasons]));
    expect(by.regulatory_brief).toEqual(["cites_changed_source"]);
    expect(by.uses_claim).toEqual(["cites_stale_claim"]);
    expect(by.old_quote).toEqual(["excerpt_no_longer_in_source", "cites_changed_source"]);
    expect(by.mentions_date).toEqual(["mentions_previous_deadline"]);
    expect(by.unrelated).toBeUndefined();
  });

  it("the brief lists the computed impact for the agent", () => {
    const notes = changeBriefNotes({
      watchName: "W",
      jurisdiction: "EU",
      topic: "t",
      sourceId: SRC,
      kind: "deadline_shift",
      summary: "s",
      previousDeadline: new Date("2026-08-02T00:00:00Z"),
      newDeadline: new Date("2027-12-02T00:00:00Z"),
      impact,
    });
    expect(notes).toContain("previous_deadline: 2026-08-02");
    expect(notes).toContain("- old_quote [approved]: excerpt_no_longer_in_source, cites_changed_source");
  });
});

describe("simulated change brief", () => {
  it("cites the updated source verbatim and passes the gates (with expert review required)", () => {
    const sources = DEMO_SOURCES.map((s) => (s.id === SRC ? { ...s, content: DEMO_PREPARED_CHANGE.updatedSourceText } : s));
    const kb = buildSnapshot({ tenantId: DEMO_TENANT_ID, sources, claims: DEMO_CLAIMS.map((c) => (c.id === "clm_reg_high_risk_date" ? { ...c, state: "stale" as const } : c)) });
    const prompt = renderPrompt(AGENT_REGULATORY_CHANGE_PROMPT, {
      snapshot: kb,
      brief: { productName: "W", notes: `watched_source_id: ${SRC}\naffected_assets:\n- Regulatory GTM brief [approved]: cites_changed_source` },
    });
    const brief = simulatedChangeBrief(prompt.user);
    expect(RegulatoryChangeBriefV1.safeParse(brief).success).toBe(true);
    expect(brief.whatChanged.evidence[0]!.excerpt).toContain("postponed to 2 December 2027");
    expect(brief.affectedMessages).toHaveLength(1);
    const report = runQualityGates("regulatory_change_brief", brief, kb);
    expect(report.passed).toBe(true);
    expect(report.requiresExpertReview).toBe(true);
  });
});
