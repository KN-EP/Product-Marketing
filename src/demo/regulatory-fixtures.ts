/**
 * M16 regulatory radar: SYNTHETIC watched item, a prepared change for the demo
 * and the simulated change-brief agent. Not legal text: the deadline and its
 * shift are an invented demo scenario.
 */
import { DEMO_SOURCES, DEMO_TENANT_ID, OTHER_TENANT_ID } from "./fixtures";

export const DEMO_WATCHES = [
  {
    id: "rwt_demo_high_risk_date",
    tenantId: DEMO_TENANT_ID,
    name: "[SYNTHETIC] EU AI Act — application date of high-risk obligations",
    jurisdiction: "EU",
    topic: "When obligations for high-risk AI systems apply (demo scenario)",
    sourceId: "src_demo_regulatory_summary",
    regulatoryTriggerId: "rtr_demo_eu_ai_act",
    currentDeadline: "2026-08-02",
  },
  {
    id: "rwt_other_demo",
    tenantId: OTHER_TENANT_ID,
    name: "[SYNTHETIC] Other tenant watch",
    jurisdiction: "N/A",
    topic: "Isolation test record",
    sourceId: "src_other_note",
    regulatoryTriggerId: null,
    currentDeadline: null,
  },
] as const;

const current = DEMO_SOURCES.find((s) => s.id === "src_demo_regulatory_summary")!.content;

/** Demo: "Load prepared change (simulated)" — the deadline moves; every other sentence stays. */
export const DEMO_PREPARED_CHANGE = {
  watchId: "rwt_demo_high_risk_date",
  kind: "deadline_shift" as const,
  summary: "[SYNTHETIC] Deadline shift in the demo scenario: high-risk obligations postponed by about sixteen months.",
  newDeadline: "2027-12-02",
  updatedSourceText: current.replace(
    "In this demo scenario, obligations for high-risk AI systems apply from 2 August 2026.",
    "In this demo scenario, the application of obligations for high-risk AI systems was postponed to 2 December 2027.",
  ),
};

type Ev = { sourceId: string; excerpt: string };
const S = (text: string, kind: "fact" | "interpretation" | "hypothesis" | "suggestion", extra: Partial<{ evidence: Ev[]; regulatory: boolean }> = {}) => ({
  text,
  kind,
  claimIds: [] as string[],
  evidence: [] as Ev[],
  competitorEvidenceIds: [] as string[],
  kpiRefs: [] as string[],
  regulatory: false,
  comparative: false,
  ...extra,
});

/** A verbatim excerpt of the watched source as the prompt shows it (prefers the changed sentence). */
function excerptFromPrompt(user: string): Ev | null {
  const id = /watched_source_id: (\S+)/.exec(user)?.[1];
  if (!id) return null;
  const m = new RegExp(`<source id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>\\n([\\s\\S]*?)\\n</source>`).exec(user);
  if (!m) return null;
  const sentences = m[1]!.split(/(?<=\.)\s+/).map((s) => s.replace(/\.$/, "").trim()).filter((s) => s.length >= 30);
  const pick = sentences.find((s) => /postpon|deadline|apply from|applies from/i.test(s)) ?? sentences[sentences.length - 1];
  return pick ? { sourceId: id, excerpt: pick } : null;
}

/** Simulated change-brief agent: deterministic, cites the updated source verbatim, never gives legal advice. */
export function simulatedChangeBrief(user: string) {
  const ev = excerptFromPrompt(user);
  const affected = [...user.matchAll(/^- (.+?) \[(\w+)\]: (.+)$/gm)].slice(0, 5);
  return {
    schemaVersion: "regulatory_change_brief.v1",
    whatChanged: ev
      ? S(`${ev.excerpt}.`, "fact", { evidence: [ev], regulatory: true })
      : S("The watched regulatory text changed; see the recorded change.", "interpretation", { regulatory: true }),
    whyItMatters: S(
      "Messages that use the previous deadline as the reason to act now lose their basis; buyers may defer decisions if urgency rested on the date alone.",
      "interpretation",
      { regulatory: true },
    ),
    affectedMessages: affected.map((m) => ({
      asset: m[1]!,
      issue: S(`Flagged by the radar: ${m[3]!.replace(/_/g, " ")}.`, "interpretation"),
      suggestedChange: S("Re-check every date and deadline argument; lead with operational reasons (overview, ownership, audit trail) instead of deadline pressure.", "suggestion"),
    })),
    messagingImplications: [
      S("Do not build urgency on a regulatory deadline alone; anchor the reason to act in customer and audit requirements that apply today.", "suggestion"),
      S("Name the new timeline only as the regulator states it, with the source excerpt, after expert review.", "suggestion", { regulatory: true }),
    ],
    customerCommunication: S(
      "Inform existing customers proactively that the timeline moved and what stays relevant for them; avoid any statement that implies legal certainty.",
      "suggestion",
      { regulatory: true },
    ),
    updatedDoNotSay: ["The deadline is fixed", "You must act before the previous date", "Our product makes you compliant"],
    expertValidationRequired: ["The new timeline and its legal status", "Whether any obligation still applies on the previous date"],
    approvalChecklist: [
      "Every statement about the law cites the updated source verbatim",
      "Reviewed by a legal/regulatory expert",
      "Affected assets re-reviewed or archived",
      "Stale claims re-verified or retired",
    ],
  };
}
