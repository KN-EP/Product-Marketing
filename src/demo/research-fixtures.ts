/**
 * M14 station "Win/loss & research": SYNTHETIC interviews for the demo tenant
 * and the simulated research agent. No real company, person or quote: every
 * account is a pseudonymised, invented label and every note is invented.
 */
import type { WinLossStats } from "../domain/schemas/research";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "./fixtures";

export interface DemoInterview {
  id: string;
  tenantId: string;
  productId: string;
  accountLabel: string;
  segment: string;
  outcome: "won" | "lost" | "churned" | "no_decision";
  competitorId: string | null;
  reasons: string[];
  primaryReason: string;
  consentStatus: "requested" | "granted" | "declined";
  /** Only with granted consent: stored as a confidential interview source. */
  source: { id: string; title: string; content: string } | null;
}

const note = (text: string) => `SYNTHETIC DEMO INTERVIEW (invented, pseudonymised). ${text}`;

export const DEMO_INTERVIEWS: DemoInterview[] = [
  {
    id: "wli_demo_a",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    accountLabel: "[SYNTHETIC] Mid-sized automotive supplier A",
    segment: "Regulated mid-market",
    outcome: "won",
    competitorId: "cmp_b",
    reasons: ["expert_support", "time_to_audit", "effort_reduction"],
    primaryReason: "expert_support",
    consentStatus: "granted",
    source: {
      id: "src_wli_demo_a",
      title: "[SYNTHETIC] Win/loss interview — mid-sized automotive supplier A",
      content: note(
        "The customer audit was close and we had no compliance team of our own. What decided it was that an expert walked us through the risk assessment while the tool kept the register up to date.",
      ),
    },
  },
  {
    id: "wli_demo_b",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    accountLabel: "[SYNTHETIC] Industrial machinery manufacturer B",
    segment: "Regulated mid-market",
    outcome: "won",
    competitorId: "cmp_a",
    reasons: ["expert_support", "platform_breadth"],
    primaryReason: "expert_support",
    consentStatus: "granted",
    source: {
      id: "src_wli_demo_b",
      title: "[SYNTHETIC] Win/loss interview — industrial machinery manufacturer B",
      content: note(
        "We wanted one place for the AI register and the documentation our auditors ask for. Having someone to call when a classification was unclear mattered more than the feature list.",
      ),
    },
  },
  {
    id: "wli_demo_c",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    accountLabel: "[SYNTHETIC] Logistics service provider C",
    segment: "Regulated mid-market",
    outcome: "lost",
    competitorId: "cmp_b",
    reasons: ["existing_system", "integrations"],
    primaryReason: "existing_system",
    consentStatus: "granted",
    source: {
      id: "src_wli_demo_c",
      title: "[SYNTHETIC] Win/loss interview — logistics service provider C",
      content: note(
        "We already run a GRC platform for the whole group and did not want a second system. The missing connector to our ticketing tool made the decision easy.",
      ),
    },
  },
  {
    id: "wli_demo_d",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    accountLabel: "[SYNTHETIC] Software scale-up D",
    segment: "Scale-up",
    outcome: "lost",
    competitorId: "cmp_c",
    reasons: ["price_value", "functionality"],
    primaryReason: "price_value",
    consentStatus: "granted",
    source: {
      id: "src_wli_demo_d",
      title: "[SYNTHETIC] Win/loss interview — software scale-up D",
      content: note(
        "For our size the expert package felt like more than we needed. We chose a cheaper tool that automated the evidence collection for our cloud stack.",
      ),
    },
  },
  {
    id: "wli_demo_e",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    accountLabel: "[SYNTHETIC] Regional financial services firm E",
    segment: "Regulated mid-market",
    outcome: "lost",
    competitorId: null,
    reasons: ["budget_ownership", "status_quo"],
    primaryReason: "budget_ownership",
    consentStatus: "granted",
    source: {
      id: "src_wli_demo_e",
      title: "[SYNTHETIC] Win/loss interview — regional financial services firm E",
      content: note(
        "Data protection, IT and compliance all liked it, but nobody owned the budget. In the end we stayed with spreadsheets and our external advisor.",
      ),
    },
  },
  {
    // Consent only requested: counted, never analysed, no notes stored.
    id: "wli_demo_f",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    accountLabel: "[SYNTHETIC] Medical device manufacturer F",
    segment: "Regulated mid-market",
    outcome: "churned",
    competitorId: null,
    reasons: ["effort_reduction"],
    primaryReason: "effort_reduction",
    consentStatus: "requested",
    source: null,
  },
  {
    id: "wli_other_a",
    tenantId: OTHER_TENANT_ID,
    productId: "prd_other_demo",
    accountLabel: "[SYNTHETIC] Other tenant account",
    segment: "Synthetic",
    outcome: "lost",
    competitorId: null,
    reasons: ["price_value"],
    primaryReason: "price_value",
    consentStatus: "granted",
    source: {
      id: "src_wli_other_a",
      title: "[SYNTHETIC] Other tenant interview (isolation test)",
      content: note("Isolation test record of the second demo tenant. It must never appear in the first tenant."),
    },
  },
];

/** Verbatim excerpts of the seeded interview sources (gate G4 finds them). */
const EXCERPT = {
  expert: { sourceId: "src_wli_demo_a", excerpt: "an expert walked us through the risk assessment while the tool kept the register up to date" },
  oneplace: { sourceId: "src_wli_demo_b", excerpt: "Having someone to call when a classification was unclear mattered more than the feature list" },
  existing: { sourceId: "src_wli_demo_c", excerpt: "did not want a second system" },
  connector: { sourceId: "src_wli_demo_c", excerpt: "The missing connector to our ticketing tool made the decision easy" },
  size: { sourceId: "src_wli_demo_d", excerpt: "For our size the expert package felt like more than we needed" },
  budget: { sourceId: "src_wli_demo_e", excerpt: "nobody owned the budget" },
} as const;

type Ev = { sourceId: string; excerpt: string };
const S = (text: string, kind: "fact" | "interpretation" | "hypothesis" | "suggestion", evidence: Ev[] = []) => ({
  text,
  kind,
  claimIds: [] as string[],
  evidence,
  competitorEvidenceIds: [] as string[],
  kpiRefs: [] as string[],
  regulatory: false,
  comparative: false,
});

/** The stats block the orchestrator rendered into the prompt. */
export function winLossStatsFromPrompt(user: string): WinLossStats | null {
  const m = /<win_loss_stats[^>]*>\n[^\n]*\n([\s\S]*?)\n<\/win_loss_stats>/.exec(user);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as WinLossStats;
  } catch {
    return null;
  }
}

/**
 * Simulated research agent: a deterministic synthesis from the computed stats
 * in the prompt. It quotes only those numbers (gate G15) and cites interview
 * excerpts only when that interview source is in the prompt (gate G4).
 */
export function simulatedWinLossSynthesis(user: string) {
  const stats = winLossStatsFromPrompt(user) ?? {
    interviews: 0,
    excludedWithoutConsent: 0,
    won: 0,
    lost: 0,
    churned: 0,
    noDecision: 0,
    winRatePct: null,
    reasons: [],
    competitors: [],
    segments: [],
  };
  const has = (e: Ev) => user.includes(`<source id="${e.sourceId}"`);
  const ev = (...es: Ev[]) => es.filter(has);

  const winReasons = stats.reasons.filter((r) => r.won > 0).sort((a, b) => b.won - a.won).slice(0, 3);
  const lossReasons = stats.reasons.filter((r) => r.lost + r.churned > 0).sort((a, b) => b.lost + b.churned - (a.lost + a.churned)).slice(0, 4);
  const winEvidence: Record<string, Ev[]> = { expert_support: ev(EXCERPT.expert, EXCERPT.oneplace), platform_breadth: ev(EXCERPT.oneplace) };
  const lossEvidence: Record<string, Ev[]> = {
    existing_system: ev(EXCERPT.existing),
    integrations: ev(EXCERPT.connector),
    price_value: ev(EXCERPT.size),
    budget_ownership: ev(EXCERPT.budget),
  };

  const summary = [
    `${stats.interviews} consented interviews: ${stats.won} won, ${stats.lost} lost, ${stats.churned} churned.`,
    stats.winRatePct !== null ? `Win rate of the decided deals in this sample: ${stats.winRatePct} %.` : null,
    stats.excludedWithoutConsent ? `${stats.excludedWithoutConsent} interview(s) without consent are not analysed.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    schemaVersion: "win_loss_synthesis.v1",
    summary: S(summary, "interpretation"),
    winDrivers: winReasons.length
      ? winReasons.map((r) => ({
          theme: r.label,
          reasonCodes: [r.code],
          statement: S(`${r.label} was named in ${r.won} of ${stats.won} won deals.`, "interpretation", winEvidence[r.code] ?? []),
        }))
      : [{ theme: "No won deal yet", reasonCodes: [], statement: S("The consented interviews contain no won deal yet.", "interpretation") }],
    lossDrivers: lossReasons.length
      ? lossReasons.map((r) => ({
          theme: r.label,
          reasonCodes: [r.code],
          statement: S(`${r.label} was named in ${r.lost} lost and ${r.churned} churned deals.`, "interpretation", lossEvidence[r.code] ?? []),
        }))
      : [{ theme: "No lost deal yet", reasonCodes: [], statement: S("The consented interviews contain no lost deal yet.", "interpretation") }],
    competitorPatterns: stats.competitors.slice(0, 6).map((c) => ({
      competitor: c.name,
      statement: S(`Against ${c.name}: ${c.won} won and ${c.lost} lost in this sample — too few interviews for a pattern.`, "hypothesis"),
    })),
    segmentInsights: stats.segments.slice(0, 6).map((s) => ({
      segment: s.segment,
      statement: S(`${s.segment}: ${s.interviews} interviews, ${s.won} won and ${s.lost} lost.`, "interpretation"),
    })),
    implications: [
      {
        area: "messaging",
        recommendation: S(
          "Lead with the combination of software and expert guidance for teams without their own compliance function; keep the register as the proof, not the headline.",
          "suggestion",
          ev(EXCERPT.expert),
        ),
      },
      {
        area: "sales_enablement",
        recommendation: S("Add a discovery question early: who owns the budget across data protection, IT and compliance?", "suggestion", ev(EXCERPT.budget)),
      },
      {
        area: "product",
        recommendation: S("Validate demand for a ticketing connector before prioritising it — a single lost deal is not a roadmap signal.", "hypothesis", ev(EXCERPT.connector)),
      },
      {
        area: "segment_focus",
        recommendation: S("Scale-ups that only need automated evidence may be a weaker fit than regulated mid-sized companies; test this with more interviews.", "hypothesis", ev(EXCERPT.size)),
      },
      {
        area: "crm_data",
        recommendation: S("Use the same reason codes as a mandatory loss-reason field in the CRM, so interviews and pipeline data can be compared.", "suggestion"),
      },
    ],
    hypothesesToValidate: [
      "Expert support is the main reason to buy in regulated mid-sized companies.",
      "Existing group-wide GRC platforms are the main structural reason to lose.",
      "A missing budget owner stalls deals more often than price.",
    ],
    limitations: [
      "Small, synthetic sample: drivers are hypotheses, not market facts.",
      "Interviews without granted consent are counted but not analysed.",
      "Reasons are self-reported by the interviewees; sales perception may differ.",
    ],
    approvalChecklist: [
      "Every quote is a verbatim excerpt of a consented interview source",
      "No person named; accounts stay pseudonymised",
      "Numbers only from the computed statistics",
      "Implications reviewed with product, sales and customer success",
    ],
  };
}
