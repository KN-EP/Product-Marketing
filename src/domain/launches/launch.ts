import { z } from "zod";
import { LAUNCH_PHASES, LaunchPhase, LaunchTier, type LaunchReadiness, type PhaseReadiness, type ReadinessCheck } from "../schemas/launch";

/**
 * M15 station "Launch". A launch is a human briefing (tier, phases, dates,
 * pricing model, proof). Readiness is DETERMINISTIC: computed here from facts
 * the server reads (approved deliverables, claims, proof) — never by a model.
 * A human reviewer decides go / no-go per phase; "go" is refused while a
 * required check fails.
 */

export const TIER_LABEL: Record<LaunchTier, string> = {
  tier_1: "Tier 1 — broad market launch",
  tier_2: "Tier 2 — targeted launch",
  tier_3: "Tier 3 — quiet availability",
};
export const PHASE_LABEL: Record<LaunchPhase, string> = {
  early_access: "Early access",
  general_availability: "General availability",
  customer_launch: "Existing customers",
  market_launch: "Market launch",
};
export const PHASE_DATE_FIELD = {
  early_access: "earlyAccessOn",
  general_availability: "generalAvailabilityOn",
  customer_launch: "customerLaunchOn",
  market_launch: "marketLaunchOn",
} as const satisfies Record<LaunchPhase, string>;

const Id = z.string().trim().min(1).max(64);
const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date");
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), t.optional());

const datesInOrder = (l: Partial<Record<(typeof PHASE_DATE_FIELD)[LaunchPhase], string>>) => {
  const ds = LAUNCH_PHASES.map((p) => l[PHASE_DATE_FIELD[p]]).filter((d): d is string => !!d);
  return ds.every((d, i) => i === 0 || ds[i - 1]! <= d);
};

/** Strict: unknown keys (e.g. a tenantId) are rejected. Product and release ids are resolved via tenantDb (404 on a miss). */
export const LaunchInput = z
  .strictObject({
    productId: Id,
    releaseId: optional(Id),
    name: z.string().trim().min(3).max(120),
    tier: LaunchTier,
    summary: z.string().trim().min(10).max(1000),
    pricingModel: z.string().trim().min(2).max(200),
    targetSegments: z.string().trim().min(2).max(200),
    earlyAccessOn: optional(IsoDate),
    generalAvailabilityOn: optional(IsoDate),
    customerLaunchOn: optional(IsoDate),
    marketLaunchOn: optional(IsoDate),
    externalReferences: z.coerce.number().int().min(0).max(100).default(0),
    internalPilot: z.boolean().default(false),
  })
  .refine((l) => LAUNCH_PHASES.some((p) => l[PHASE_DATE_FIELD[p]]), { message: "Plan at least one phase date", path: ["generalAvailabilityOn"] })
  .refine(datesInOrder, { message: "Phase dates must follow the order early access → GA → existing customers → market", path: ["marketLaunchOn"] });
export type LaunchInput = z.infer<typeof LaunchInput>;

/** Proof can grow during a launch (e.g. early-access customers agree to be references). */
export const LaunchProofInput = z.strictObject({
  launchId: Id,
  externalReferences: z.coerce.number().int().min(0).max(100),
  internalPilot: z.boolean(),
});

export const LaunchDecisionInput = z.strictObject({
  launchId: Id,
  phase: LaunchPhase,
  decision: z.enum(["go", "no_go"]),
  comment: optional(z.string().trim().max(1000)),
  risksAcknowledged: z.boolean().optional(),
});

/** What the server reads before computing readiness. `null` = not evaluated in this context. */
export interface ReadinessFacts {
  approvedClaims: number;
  staleClaims: number;
  approvedMessaging: boolean;
  approvedBattlecard: boolean;
  /** An approved sales play or sales toolkit deliverable for the product. */
  approvedEnablement: boolean;
  /** null while the launch plan itself is being generated (it cannot check itself). */
  approvedLaunchPlan: boolean | null;
  /** null when the launch is not tied to a release. */
  approvedReleasePlan: boolean | null;
  approvedWinLoss: boolean;
  externalReferences: number;
  internalPilot: boolean;
  /** M16: open regulatory radar alerts that affect the product's claims. */
  openRegulatoryAlerts: number;
}

type Need = "required" | "recommended" | "na";
const ORDER: Record<LaunchPhase, number> = { early_access: 0, general_availability: 1, customer_launch: 2, market_launch: 3 };
const from = (p: LaunchPhase, start: LaunchPhase) => ORDER[p] >= ORDER[start];

/**
 * The readiness rules. Each returns how strongly a check applies to a phase
 * of a tier, and whether it passes. Kept as data so the UI, the plan and the
 * go/no-go decision all show the same thing.
 */
const RULES: {
  id: string;
  label: string;
  need: (phase: LaunchPhase, tier: LaunchTier, f: ReadinessFacts) => Need;
  pass: (f: ReadinessFacts) => boolean | null;
  detail: (f: ReadinessFacts) => string;
}[] = [
  {
    id: "approved_claims",
    label: "At least one approved product claim",
    need: () => "required",
    pass: (f) => f.approvedClaims > 0,
    detail: (f) => `${f.approvedClaims} approved claim(s)`,
  },
  {
    id: "no_stale_claims",
    label: "No stale claims (changed sources re-verified)",
    need: () => "required",
    pass: (f) => f.staleClaims === 0,
    detail: (f) => (f.staleClaims ? `${f.staleClaims} stale claim(s) to re-verify` : "none"),
  },
  {
    id: "no_open_regulatory_alerts",
    label: "No open regulatory radar alert affecting the product",
    need: () => "required",
    pass: (f) => f.openRegulatoryAlerts === 0,
    detail: (f) => (f.openRegulatoryAlerts ? `${f.openRegulatoryAlerts} open alert(s)` : "none"),
  },
  {
    id: "launch_plan_approved",
    label: "Launch plan approved",
    need: () => "required",
    pass: (f) => f.approvedLaunchPlan,
    detail: (f) => (f.approvedLaunchPlan === null ? "evaluated after the plan is approved" : f.approvedLaunchPlan ? "approved" : "not approved yet"),
  },
  {
    id: "messaging_approved",
    label: "Messaging framework approved",
    need: (p, t) => (t !== "tier_3" && from(p, "general_availability") ? "required" : "recommended"),
    pass: (f) => f.approvedMessaging,
    detail: (f) => (f.approvedMessaging ? "approved" : "not approved yet"),
  },
  {
    id: "release_plan_approved",
    label: "Release communication plan approved (linked release)",
    need: (p, _t, f) => (f.approvedReleasePlan === null ? "na" : from(p, "general_availability") ? "required" : "recommended"),
    pass: (f) => f.approvedReleasePlan,
    detail: (f) => (f.approvedReleasePlan === null ? "no release linked" : f.approvedReleasePlan ? "approved" : "not approved yet"),
  },
  {
    id: "sales_enablement",
    label: "Sales enablement approved (sales play or toolkit deliverable)",
    need: (p, t) => (t !== "tier_3" && from(p, "customer_launch") ? "required" : from(p, "general_availability") ? "recommended" : "na"),
    pass: (f) => f.approvedEnablement,
    detail: (f) => (f.approvedEnablement ? "approved" : "nothing approved yet"),
  },
  {
    id: "battlecard_approved",
    label: "Competitive battlecard approved",
    need: (p, t) => (p === "market_launch" ? (t === "tier_1" ? "required" : "recommended") : "na"),
    pass: (f) => f.approvedBattlecard,
    detail: (f) => (f.approvedBattlecard ? "approved" : "not approved yet"),
  },
  {
    id: "internal_proof",
    label: "Proof of use: internal pilot (customer zero) or an external reference",
    need: (p) => (from(p, "general_availability") ? "recommended" : "na"),
    pass: (f) => f.internalPilot || f.externalReferences > 0,
    detail: (f) => [f.internalPilot ? "internal pilot documented" : null, `${f.externalReferences} external reference(s)`].filter(Boolean).join(", "),
  },
  {
    id: "external_references",
    label: "At least one external reference customer",
    need: (p, t) => (p === "market_launch" ? (t === "tier_1" ? "required" : t === "tier_2" ? "recommended" : "na") : "na"),
    pass: (f) => f.externalReferences > 0,
    detail: (f) => `${f.externalReferences} external reference(s)`,
  },
  {
    id: "win_loss_evidence",
    label: "Win/loss synthesis approved (why customers buy)",
    need: (p, t) => (p === "market_launch" && t === "tier_1" ? "recommended" : "na"),
    pass: (f) => f.approvedWinLoss,
    detail: (f) => (f.approvedWinLoss ? "approved" : "none approved"),
  },
];

/** Readiness of every phase. Deterministic: same facts → same result. */
export function computeReadiness(
  launch: { tier: LaunchTier } & Partial<Record<(typeof PHASE_DATE_FIELD)[LaunchPhase], Date | string | null>>,
  facts: ReadinessFacts,
): LaunchReadiness {
  const day = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);
  const phases: PhaseReadiness[] = LAUNCH_PHASES.map((phase) => {
    const checks: ReadinessCheck[] = RULES.map((r) => {
      const need = r.need(phase, launch.tier, facts);
      const passed = r.pass(facts);
      return {
        id: r.id,
        label: r.label,
        required: need === "required",
        status: need === "na" || passed === null ? "na" : passed ? "pass" : "fail",
        detail: r.detail(facts),
      };
    });
    const requiredFail = checks.some((c) => c.required && c.status === "fail");
    const recommendedFail = checks.some((c) => !c.required && c.status === "fail");
    return {
      phase,
      plannedOn: day(launch[PHASE_DATE_FIELD[phase]]),
      status: requiredFail ? "no_go" : recommendedFail ? "go_with_risks" : "go",
      checks,
    };
  });
  return { tier: launch.tier, phases };
}

export const failedRequired = (p: PhaseReadiness) => p.checks.filter((c) => c.required && c.status === "fail");
export const failedRecommended = (p: PhaseReadiness) => p.checks.filter((c) => !c.required && c.status === "fail");

export interface LaunchBriefing {
  name: string;
  tier: string;
  summary: string;
  pricingModel: string;
  targetSegments: string;
  externalReferences: number;
  internalPilot: boolean;
  release: { name: string; version: string } | null;
}

/** Briefing lines for the launch agent's <brief> block, including the computed readiness. */
export function launchBriefNotes(l: LaunchBriefing, readiness: LaunchReadiness): string {
  return [
    `launch: ${l.name}`,
    `tier: ${l.tier}`,
    `summary: ${l.summary}`,
    `pricing_model: ${l.pricingModel}`,
    `target_segments: ${l.targetSegments}`,
    `release: ${l.release ? `${l.release.name} ${l.release.version}` : "none"}`,
    `proof: internal_pilot=${l.internalPilot ? "yes" : "no"}, external_references=${l.externalReferences}`,
    "computed_readiness (decided by people, not by you):",
    ...readiness.phases.map(
      (p) =>
        `- ${p.phase} (${p.plannedOn ?? "no date"}): ${p.status}${failedRequired(p).length ? `; missing: ${failedRequired(p).map((c) => c.id).join(", ")}` : ""}${failedRecommended(p).length ? `; risks: ${failedRecommended(p).map((c) => c.id).join(", ")}` : ""}`,
    ),
  ].join("\n");
}
