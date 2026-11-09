/** M14 win/loss & research: taxonomy, input rules, computed statistics, gate G15, simulated agent. */
import { describe, expect, it } from "vitest";
import { DEMO_INTERVIEWS, simulatedWinLossSynthesis, winLossStatsFromPrompt } from "@/demo/research-fixtures";
import { DEMO_SOURCES, DEMO_TENANT_ID, DEMO_CLAIMS } from "@/demo/fixtures";
import { buildSnapshot, type SourceRecord } from "@/domain/knowledge/snapshot";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { allowedWinLossNumbers, computeWinLossStats, containsContactData, WinLossInterviewInput, type InterviewForStats } from "@/domain/research/win-loss";
import { WinLossSynthesisDraftV1 } from "@/domain/schemas/research";
import { AGENT_RESEARCH_PROMPT, renderPrompt } from "@/server/prompts";

const demo = DEMO_INTERVIEWS.filter((i) => i.tenantId === DEMO_TENANT_ID);
const forStats = (xs = demo): InterviewForStats[] =>
  xs.map((i) => ({
    outcome: i.outcome,
    segment: i.segment,
    reasons: i.reasons,
    primaryReason: i.primaryReason,
    consentStatus: i.consentStatus,
    competitorName: i.competitorId,
  }));
const interviewSources: SourceRecord[] = demo
  .filter((i) => i.source)
  .map((i) => ({ id: i.source!.id, tenantId: DEMO_TENANT_ID, title: i.source!.title, url: null, status: "active", content: i.source!.content, isSynthetic: true }));
const kb = buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: [...DEMO_SOURCES, ...interviewSources], claims: DEMO_CLAIMS });

const valid = {
  productId: "prd_x",
  accountLabel: "Mid-sized automotive supplier G",
  segment: "Regulated mid-market",
  outcome: "lost",
  reasons: ["existing_system", "integrations"],
  primaryReason: "existing_system",
  consentStatus: "granted",
  notes: "We kept the group GRC platform; a second system was not acceptable for IT.",
};

describe("interview input (consent and pseudonymisation)", () => {
  it("accepts a consented interview with notes", () => {
    expect(WinLossInterviewInput.safeParse(valid).success).toBe(true);
  });
  it("refuses notes without granted consent and requires notes with it", () => {
    expect(WinLossInterviewInput.safeParse({ ...valid, consentStatus: "requested" }).success).toBe(false);
    expect(WinLossInterviewInput.safeParse({ ...valid, consentStatus: "requested", notes: undefined }).success).toBe(true);
    expect(WinLossInterviewInput.safeParse({ ...valid, notes: "too short" }).success).toBe(false);
  });
  it("refuses contact data, a primary reason outside the reasons, unknown codes and injected keys", () => {
    expect(WinLossInterviewInput.safeParse({ ...valid, notes: `${valid.notes} Call max.muster@example.com` }).success).toBe(false);
    expect(WinLossInterviewInput.safeParse({ ...valid, accountLabel: "Contact +49 89 1234 5678" }).success).toBe(false);
    expect(WinLossInterviewInput.safeParse({ ...valid, primaryReason: "price_value" }).success).toBe(false);
    expect(WinLossInterviewInput.safeParse({ ...valid, reasons: ["vibes"], primaryReason: "vibes" }).success).toBe(false);
    expect(WinLossInterviewInput.safeParse({ ...valid, tenantId: "tnt_other_demo" }).success).toBe(false);
    expect(containsContactData("no contact here")).toBe(false);
  });
  it("withdrawn consent cannot be entered directly (it is an action on a recorded interview)", () => {
    expect(WinLossInterviewInput.safeParse({ ...valid, consentStatus: "withdrawn" }).success).toBe(false);
  });
});

describe("computed statistics (consented interviews only)", () => {
  const stats = computeWinLossStats(forStats());
  it("counts outcomes, win rate and excluded interviews", () => {
    expect(stats).toMatchObject({ interviews: 5, excludedWithoutConsent: 1, won: 2, lost: 3, churned: 0, noDecision: 0, winRatePct: 40 });
  });
  it("aggregates reasons (named, primary, by outcome) and sorts by frequency", () => {
    expect(stats.reasons[0]).toMatchObject({ code: "expert_support", total: 2, primary: 2, won: 2, lost: 0 });
    expect(stats.reasons.find((r) => r.code === "effort_reduction")).toMatchObject({ total: 1, won: 1 });
    expect(stats.reasons.some((r) => r.code === "status_quo" && r.lost === 1)).toBe(true);
  });
  it("groups by competitor and segment", () => {
    expect(stats.competitors.find((c) => c.name === "cmp_b")).toMatchObject({ won: 1, lost: 1 });
    expect(stats.segments.find((s) => s.segment === "Scale-up")).toMatchObject({ interviews: 1, lost: 1 });
  });
  it("no decided deal → no win rate", () => {
    expect(computeWinLossStats([]).winRatePct).toBeNull();
  });
  it("allowed numbers contain the counts, shares and the as-of date", () => {
    const allowed = allowedWinLossNumbers(stats, "2026-11-09");
    for (const n of [5, 1, 2, 3, 40, 2026, 11, 9]) expect(allowed).toContain(n);
    expect(allowed).not.toContain(73);
  });
});

describe("gate G15 and the simulated research agent", () => {
  const stats = computeWinLossStats(forStats());
  const asOf = "2026-11-09";
  const prompt = renderPrompt(AGENT_RESEARCH_PROMPT, {
    snapshot: kb,
    brief: { productName: "Demo", notes: "interview_sources: …" },
    winLossStats: { asOf, stats },
  });

  it("the prompt carries the computed stats in a delimited block; the simulated agent reads them back", () => {
    expect(prompt.user).toContain("<win_loss_stats as_of=\"2026-11-09\">");
    expect(winLossStatsFromPrompt(prompt.user)).toEqual(stats);
  });

  it("the simulated synthesis is schema-valid and passes all gates (numbers from the stats, verbatim excerpts)", () => {
    const draft = simulatedWinLossSynthesis(prompt.user);
    expect(WinLossSynthesisDraftV1.safeParse(draft).success).toBe(true);
    const report = runQualityGates("win_loss_synthesis", { ...draft, asOf, stats }, kb);
    expect(report.findings.filter((f) => f.severity === "critical")).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.findings.some((f) => f.gate === "G15_win_loss_numbers")).toBe(false);
  });

  it("an invented number is a warning in an interpretation and critical in a fact", () => {
    const draft = simulatedWinLossSynthesis(prompt.user);
    const bad = structuredClone(draft);
    bad.summary.text = "73 % of buyers prefer expert support.";
    let r = runQualityGates("win_loss_synthesis", { ...bad, asOf, stats }, kb);
    expect(r.findings).toContainEqual(expect.objectContaining({ gate: "G15_win_loss_numbers", severity: "warning", path: "$.summary" }));
    bad.summary.kind = "fact";
    r = runQualityGates("win_loss_synthesis", { ...bad, asOf, stats }, kb);
    expect(r.findings).toContainEqual(expect.objectContaining({ gate: "G15_win_loss_numbers", severity: "critical", path: "$.summary" }));
    expect(r.passed).toBe(false);
  });

  it("a small sample is flagged; a driver stated as fact from it is critical", () => {
    const small = computeWinLossStats(forStats(demo.slice(0, 3)));
    const p = renderPrompt(AGENT_RESEARCH_PROMPT, { snapshot: kb, brief: { productName: "Demo" }, winLossStats: { asOf, stats: small } });
    const draft = simulatedWinLossSynthesis(p.user);
    let r = runQualityGates("win_loss_synthesis", { ...draft, asOf, stats: small }, kb);
    expect(r.findings).toContainEqual(expect.objectContaining({ gate: "G15_win_loss_numbers", severity: "warning", path: "$.stats" }));
    draft.winDrivers[0]!.statement.kind = "fact";
    r = runQualityGates("win_loss_synthesis", { ...draft, asOf, stats: small }, kb);
    expect(r.passed).toBe(false);
  });

  it("an excerpt of an erased (invalid) interview source fails G4", () => {
    const draft = simulatedWinLossSynthesis(prompt.user);
    const erased = buildSnapshot({
      tenantId: DEMO_TENANT_ID,
      sources: [...DEMO_SOURCES, ...interviewSources.map((s) => (s.id === "src_wli_demo_a" ? { ...s, status: "invalid" as const, content: "[Erased]" } : s))],
      claims: DEMO_CLAIMS,
    });
    const r = runQualityGates("win_loss_synthesis", { ...draft, asOf, stats }, erased);
    expect(r.passed).toBe(false);
    expect(r.findings).toContainEqual(expect.objectContaining({ gate: "G4_excerpts_exist", severity: "critical" }));
  });
});
