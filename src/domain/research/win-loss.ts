import { z } from "zod";
import type { WinLossStats } from "../schemas/research";

/**
 * M14 station "Win/loss & research". A win/loss interview is human input:
 * a pseudonymised account, the outcome, reason codes from a fixed taxonomy
 * (the same list a CRM loss-reason field should use) and — only with granted
 * consent — the interview notes. The numbers of the synthesis are computed
 * here, deterministically; the model never writes them (gate G15).
 */

export const DealOutcome = z.enum(["won", "lost", "churned", "no_decision"]);
export type DealOutcome = z.infer<typeof DealOutcome>;

/** What can be recorded when the interview is entered. Withdrawal is a separate action. */
export const ConsentAtEntry = z.enum(["requested", "granted", "declined"]);
export const ConsentStatus = z.enum(["requested", "granted", "declined", "withdrawn"]);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

/**
 * Fixed reason taxonomy. One list for wins and losses: the outcome says which
 * way a reason worked. Use the same codes as the CRM reason field so that
 * interviews and pipeline data can be compared.
 */
export const REASON_LABEL = {
  price_value: "Price / value for money",
  functionality: "Functional scope",
  integrations: "Integrations",
  expert_support: "Expert support",
  time_to_audit: "Speed to audit readiness",
  effort_reduction: "Less manual effort",
  platform_breadth: "All-in-one platform",
  competitor_strength: "Competitor's strength",
  status_quo: "Status quo / no need",
  timing_budget: "Timing / budget",
  existing_system: "Existing system kept",
  trust_references: "Trust / references",
  budget_ownership: "No clear budget owner",
  // M18: machine builders (industry profile "machinery")
  cost_per_part: "Cost per part over the lifecycle",
  technology_risk: "Material / technology risk",
  delivery_time: "Delivery time / capacity",
  financing: "Financing terms",
  local_presence: "Local presence / service",
  trial_result: "Trial / sample production result",
  third_party_retrofit: "Third-party retrofitter",
  used_equipment: "Used equipment",
} as const;
export const ReasonCode = z.enum(Object.keys(REASON_LABEL) as [keyof typeof REASON_LABEL, ...(keyof typeof REASON_LABEL)[]]);
export type ReasonCode = z.infer<typeof ReasonCode>;
export const REASON_CODES = ReasonCode.options;

/**
 * M18: the reason codes a tenant uses, by industry profile. One taxonomy, two
 * views: a software vendor never sees "trial result", a machine builder never
 * sees "time to audit". Recording a reason outside the profile is rejected.
 */
export type IndustryProfile = "software" | "machinery";
export const REASONS_BY_PROFILE: Record<IndustryProfile, readonly ReasonCode[]> = {
  software: [
    "price_value", "functionality", "integrations", "expert_support", "time_to_audit", "effort_reduction", "platform_breadth",
    "competitor_strength", "status_quo", "timing_budget", "existing_system", "trust_references", "budget_ownership",
  ],
  machinery: [
    "cost_per_part", "price_value", "functionality", "technology_risk", "trial_result", "delivery_time", "financing", "local_presence",
    "expert_support", "competitor_strength", "third_party_retrofit", "used_equipment", "existing_system", "status_quo", "timing_budget",
    "trust_references", "budget_ownership",
  ],
};
export function reasonsOutsideProfile(profile: IndustryProfile, reasons: readonly string[]): string[] {
  const allowed = new Set<string>(REASONS_BY_PROFILE[profile]);
  return reasons.filter((r) => !allowed.has(r));
}

export const OUTCOME_LABEL: Record<DealOutcome, string> = { won: "Won", lost: "Lost", churned: "Churned", no_decision: "No decision" };
export const CONSENT_LABEL: Record<ConsentStatus, string> = {
  requested: "Requested",
  granted: "Granted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

/** Minimum number of consented interviews before a synthesis can be generated. */
export const MIN_INTERVIEWS_FOR_SYNTHESIS = 3;
/** Below this, every driver is a hypothesis (gate G15 warns). */
export const SMALL_SAMPLE = 5;
export const MAX_NOTES_CHARS = 8000;

const Id = z.string().trim().min(1).max(64);
const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date");
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), t.optional());

/** Personal contact data has no place in win/loss records: pseudonymise before storing. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+|00)\d[\d\s/().-]{7,}\d/;
export function containsContactData(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text);
}
const noContactData = (s: string) => !containsContactData(s);
const NO_CONTACT = "Remove e-mail addresses and phone numbers (pseudonymise the interview)";

/** Strict: unknown keys (e.g. a tenantId) are rejected. Product and competitor ids are resolved via tenantDb (404 on a miss). */
export const WinLossInterviewInput = z
  .strictObject({
    productId: Id,
    accountLabel: z.string().trim().min(3).max(120).refine(noContactData, NO_CONTACT),
    segment: z.string().trim().min(2).max(80),
    outcome: DealOutcome,
    decidedOn: optional(IsoDate),
    competitorId: optional(Id),
    reasons: z
      .array(ReasonCode)
      .min(1)
      .max(5)
      .refine((r) => new Set(r).size === r.length, "Reasons must be distinct"),
    primaryReason: ReasonCode,
    interviewedOn: optional(IsoDate),
    consentStatus: ConsentAtEntry,
    notes: optional(z.string().trim().max(MAX_NOTES_CHARS).refine(noContactData, NO_CONTACT)),
  })
  .refine((i) => i.reasons.includes(i.primaryReason), { message: "The primary reason must be one of the reasons", path: ["primaryReason"] })
  .refine((i) => i.consentStatus === "granted" || !i.notes, {
    message: "Notes can only be stored with granted consent",
    path: ["notes"],
  })
  .refine((i) => i.consentStatus !== "granted" || (i.notes?.length ?? 0) >= 30, {
    message: "With granted consent, record the interview notes (at least 30 characters)",
    path: ["notes"],
  });
export type WinLossInterviewInput = z.infer<typeof WinLossInterviewInput>;

export interface InterviewForStats {
  outcome: DealOutcome;
  segment: string;
  reasons: string[];
  primaryReason: string;
  consentStatus: ConsentStatus;
  competitorName: string | null;
}

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

/**
 * Deterministic statistics over the CONSENTED interviews (consent granted).
 * Interviews without consent are only counted, never analysed.
 */
export function computeWinLossStats(interviews: readonly InterviewForStats[]): WinLossStats {
  const used = interviews.filter((i) => i.consentStatus === "granted");
  const count = (o: DealOutcome, xs = used) => xs.filter((i) => i.outcome === o).length;
  const won = count("won");
  const lost = count("lost");

  const reasons = REASON_CODES.map((code) => {
    const withCode = used.filter((i) => i.reasons.includes(code));
    return {
      code,
      label: REASON_LABEL[code],
      won: count("won", withCode),
      lost: count("lost", withCode),
      churned: count("churned", withCode),
      noDecision: count("no_decision", withCode),
      primary: used.filter((i) => i.primaryReason === code).length,
      total: withCode.length,
    };
  })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || b.primary - a.primary || a.code.localeCompare(b.code));

  const competitorNames = [...new Set(used.map((i) => i.competitorName).filter((n): n is string => !!n))].sort();
  const competitors = competitorNames.map((name) => {
    const xs = used.filter((i) => i.competitorName === name);
    return { name, won: count("won", xs), lost: count("lost", xs), churned: count("churned", xs), noDecision: count("no_decision", xs) };
  });

  const segmentNames = [...new Set(used.map((i) => i.segment))].sort();
  const segments = segmentNames.map((segment) => {
    const xs = used.filter((i) => i.segment === segment);
    return { segment, interviews: xs.length, won: count("won", xs), lost: count("lost", xs), churned: count("churned", xs), noDecision: count("no_decision", xs) };
  });

  return {
    interviews: used.length,
    excludedWithoutConsent: interviews.length - used.length,
    won,
    lost,
    churned: count("churned"),
    noDecision: count("no_decision"),
    /** Won / (won + lost), in percent — decided deals only. */
    winRatePct: pct(won, won + lost),
    reasons,
    competitors,
    segments,
  };
}

/** Every number a synthesis may quote: counts, percentages and the as-of date. */
export function allowedWinLossNumbers(stats: WinLossStats, asOf?: string): number[] {
  const out = new Set<number>([0, 100]);
  const add = (v: number | null | undefined) => {
    if (v === null || v === undefined) return;
    out.add(v);
  };
  [stats.interviews, stats.excludedWithoutConsent, stats.won, stats.lost, stats.churned, stats.noDecision, stats.winRatePct].forEach(add);
  for (const r of stats.reasons) {
    [r.won, r.lost, r.churned, r.noDecision, r.primary, r.total].forEach(add);
    if (stats.interviews > 0) add(Math.round((r.total / stats.interviews) * 100));
  }
  for (const c of stats.competitors) [c.won, c.lost, c.churned, c.noDecision, c.won + c.lost].forEach(add);
  for (const s of stats.segments) {
    [s.interviews, s.won, s.lost, s.churned, s.noDecision].forEach(add);
    if (s.won + s.lost > 0) add(Math.round((s.won / (s.won + s.lost)) * 100));
  }
  if (asOf) for (const p of asOf.split("-")) add(Number(p));
  return [...out];
}

/** Briefing lines for the research agent's <brief> block (no notes: those are sources). */
export function winLossBriefNotes(stats: WinLossStats, interviewSources: { sourceId: string; label: string; outcome: string }[]): string {
  return [
    `consented_interviews: ${stats.interviews}`,
    `excluded_without_consent: ${stats.excludedWithoutConsent}`,
    "interview_sources:",
    ...interviewSources.map((s) => `- ${s.sourceId}: ${s.label} (${s.outcome})`),
  ].join("\n");
}
