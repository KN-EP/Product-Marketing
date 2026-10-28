/**
 * Simulated agent G (M11): a deterministic, template-based performance review
 * built from the server-computed KPI results in the prompt. It only quotes
 * numbers that are in those results, so it passes gate G10 by construction —
 * and still runs through the same validation and gates as live output.
 */
import type { KpiResult } from "../domain/schemas/performance";

const S = (text: string, kind: "fact" | "interpretation" | "hypothesis" | "suggestion", kpiRefs: string[] = []) => ({
  text,
  kind,
  claimIds: [] as string[],
  evidence: [] as { sourceId: string; excerpt: string }[],
  competitorEvidenceIds: [] as string[],
  kpiRefs,
  regulatory: false,
  comparative: false,
});

const CAUSES: Record<string, string> = {
  awareness: "Reach may be too narrow: the channels may not be reaching enough of the target audience yet.",
  consideration: "The offer may not be compelling enough for the audience to take the next step.",
  decision: "Follow-up may be too slow or too generic after the first engagement.",
};

export function simulatedPerformanceReview(results: KpiResult[]) {
  const measured = results.filter((r) => r.status !== "no_data" && r.status !== "no_target");
  const behind = measured.filter((r) => r.status === "off_track" || r.status === "at_risk");
  const onTrack = measured.filter((r) => r.status === "on_track");
  const names = (rs: KpiResult[]) => rs.map((r) => r.name).join(", ");

  const summaryParts = [
    onTrack.length ? `On track: ${names(onTrack)}.` : null,
    behind.length ? `Behind the expected pace: ${names(behind)}.` : null,
    measured.length === 0 ? "No KPI has both measurements and a target yet." : null,
  ].filter(Boolean);

  const findings = measured.map((r) => ({
    title: r.name,
    observation: S(
      `${r.name}: ${r.actual} against ${r.expectedToDate} expected to date (pace ${r.pacePct} %, status ${r.status.replace(/_/g, " ")}).`,
      "fact",
      [r.name],
    ),
    likelyCauses: r.status === "on_track" ? [] : [S(CAUSES[r.funnelStage] ?? "The current activities may not match what this KPI needs.", "hypothesis", [r.name])],
  }));
  if (findings.length === 0) {
    findings.push({ title: "No measurable KPI yet", observation: S("There is not enough data with targets to assess performance yet.", "interpretation"), likelyCauses: [] });
  }

  const recommendations = behind.length
    ? behind.map((r) => ({
        title: `Lift ${r.name}`,
        action: S(`Review the activities for the ${r.funnelStage} stage and shift effort to the channel that performs best so far.`, "suggestion", [r.name]),
        expectedEffect: S(`Could bring ${r.name} closer to the expected pace.`, "hypothesis", [r.name]),
        effort: "medium" as const,
        owner: "Campaign owner",
      }))
    : [
        {
          title: "Keep the plan",
          action: S("Keep the current plan and review again after the next import.", "suggestion"),
          expectedEffect: S("Confirms whether the current pace holds.", "hypothesis"),
          effort: "low" as const,
          owner: "Campaign owner",
        },
      ];

  return {
    schemaVersion: "performance_review.v1",
    summary: S(summaryParts.join(" "), "interpretation", measured.map((r) => r.name)),
    findings,
    recommendations,
    dataGaps: results
      .filter((r) => r.status === "no_data" || r.status === "no_target")
      .map((r) => (r.status === "no_data" ? `${r.name}: no measurements imported yet.` : `${r.name}: no numeric target set yet.`)),
    approvalChecklist: [
      "Numbers checked against the KPI results table",
      "Causes treated as hypotheses, not findings",
      "Recommendations agreed with the campaign owner",
    ],
  };
}

/** Reads the <kpi_results> block of a rendered prompt (simulated mode only). */
export function kpiResultsFromPrompt(user: string): KpiResult[] {
  const m = /<kpi_results as_of="[\d-]+">\n([\s\S]*?)\n<\/kpi_results>/.exec(user);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]!) as unknown;
    return Array.isArray(parsed) ? (parsed as KpiResult[]) : [];
  } catch {
    return [];
  }
}
