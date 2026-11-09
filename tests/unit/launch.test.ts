/** M15 station "Launch": input rules, deterministic readiness, gate G16, simulated launch agent. */
import { describe, expect, it } from "vitest";
import { DEMO_CLAIMS, DEMO_SOURCES, DEMO_TENANT_ID } from "@/demo/fixtures";
import { SIMULATED_LAUNCH_PLAN } from "@/demo/launch-fixtures";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { computeReadiness, failedRequired, launchBriefNotes, LaunchInput, type ReadinessFacts } from "@/domain/launches/launch";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { LaunchPlanDraftV1 } from "@/domain/schemas/launch";

const kb = buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: DEMO_CLAIMS });
const READY: ReadinessFacts = {
  approvedClaims: 4,
  staleClaims: 0,
  approvedMessaging: true,
  approvedBattlecard: true,
  approvedEnablement: true,
  approvedLaunchPlan: true,
  approvedReleasePlan: null,
  approvedWinLoss: true,
  externalReferences: 2,
  internalPilot: true,
  openRegulatoryAlerts: 0,
};
const dates = { earlyAccessOn: "2026-11-16", generalAvailabilityOn: "2026-12-29", customerLaunchOn: "2027-01-13", marketLaunchOn: "2027-02-27" };
const phase = (r: ReturnType<typeof computeReadiness>, p: string) => r.phases.find((x) => x.phase === p)!;

describe("launch input", () => {
  const valid = { productId: "p", name: "New module", tier: "tier_1", summary: "A new module for the register.", pricingModel: "Premium", targetSegments: "Regulated mid-market", ...dates };
  it("accepts a staged launch; needs at least one phase date; dates in phase order", () => {
    expect(LaunchInput.safeParse(valid).success).toBe(true);
    expect(LaunchInput.safeParse({ ...valid, earlyAccessOn: "", generalAvailabilityOn: "", customerLaunchOn: "", marketLaunchOn: "" }).success).toBe(false);
    expect(LaunchInput.safeParse({ ...valid, marketLaunchOn: "2026-11-01" }).success).toBe(false);
    expect(LaunchInput.safeParse({ ...valid, tenantId: "x" }).success).toBe(false);
  });
});

describe("readiness (deterministic)", () => {
  it("everything in place → go for every phase", () => {
    const r = computeReadiness({ tier: "tier_1", ...dates }, READY);
    expect(r.phases.map((p) => p.status)).toEqual(["go", "go", "go", "go"]);
    expect(phase(r, "market_launch").plannedOn).toBe("2027-02-27");
  });

  it("the role-play case: tier 1, customer zero only → early access ok, market launch not ready (no external reference)", () => {
    const r = computeReadiness({ tier: "tier_1", ...dates }, { ...READY, externalReferences: 0 });
    expect(phase(r, "early_access").status).toBe("go");
    expect(phase(r, "general_availability").status).toBe("go");
    expect(phase(r, "market_launch").status).toBe("no_go");
    expect(failedRequired(phase(r, "market_launch")).map((c) => c.id)).toEqual(["external_references"]);
  });

  it("tier 2 without references → market launch only at risk; tier 3 never needs references", () => {
    expect(phase(computeReadiness({ tier: "tier_2", ...dates }, { ...READY, externalReferences: 0, internalPilot: false }), "market_launch").status).toBe("go_with_risks");
    expect(phase(computeReadiness({ tier: "tier_3", ...dates }, { ...READY, externalReferences: 0, internalPilot: true }), "market_launch").status).toBe("go");
  });

  it("stale claims, open regulatory alerts and an unapproved plan block every phase", () => {
    for (const f of [{ staleClaims: 1 }, { openRegulatoryAlerts: 1 }, { approvedLaunchPlan: false }]) {
      const r = computeReadiness({ tier: "tier_2", ...dates }, { ...READY, ...f });
      expect(r.phases.every((p) => p.status === "no_go")).toBe(true);
    }
  });

  it("messaging from GA, enablement from the customer launch (tier 1/2); release plan only when a release is linked", () => {
    const r = computeReadiness({ tier: "tier_2", ...dates }, { ...READY, approvedMessaging: false, approvedEnablement: false });
    expect(phase(r, "early_access").status).toBe("go_with_risks");
    expect(failedRequired(phase(r, "general_availability")).map((c) => c.id)).toEqual(["messaging_approved"]);
    expect(failedRequired(phase(r, "customer_launch")).map((c) => c.id)).toEqual(["messaging_approved", "sales_enablement"]);
    expect(phase(r, "general_availability").checks.find((c) => c.id === "release_plan_approved")!.status).toBe("na");
    const withRelease = computeReadiness({ tier: "tier_2", ...dates }, { ...READY, approvedReleasePlan: false });
    expect(failedRequired(phase(withRelease, "general_availability")).map((c) => c.id)).toEqual(["release_plan_approved"]);
  });

  it("while the plan is being generated its own approval is not evaluated (n/a)", () => {
    const r = computeReadiness({ tier: "tier_1", ...dates }, { ...READY, approvedLaunchPlan: null });
    expect(r.phases.every((p) => p.checks.find((c) => c.id === "launch_plan_approved")!.status === "na")).toBe(true);
  });

  it("the brief tells the agent the readiness and that people decide", () => {
    const r = computeReadiness({ tier: "tier_1", ...dates }, { ...READY, externalReferences: 0 });
    const notes = launchBriefNotes(
      { name: "L", tier: "tier_1", summary: "s", pricingModel: "p", targetSegments: "t", externalReferences: 0, internalPilot: true, release: null },
      r,
    );
    expect(notes).toContain("decided by people, not by you");
    expect(notes).toContain("- market_launch (2027-02-27): no_go; missing: external_references");
  });
});

describe("gate G16 and the simulated launch plan", () => {
  it("the simulated plan is schema-valid, passes the gates when every phase is ready", () => {
    expect(LaunchPlanDraftV1.safeParse(SIMULATED_LAUNCH_PLAN).success).toBe(true);
    const readiness = computeReadiness({ tier: "tier_1", ...dates }, READY);
    const r = runQualityGates("launch_plan", { ...SIMULATED_LAUNCH_PLAN, asOf: "2026-11-09", readiness }, kb);
    expect(r.passed).toBe(true);
    expect(r.findings.filter((f) => f.gate === "G16_launch_readiness")).toEqual([]);
  });

  it("warns for each planned phase that is not ready (naming the missing checks) without blocking", () => {
    const readiness = computeReadiness({ tier: "tier_1", ...dates }, { ...READY, externalReferences: 0 });
    const r = runQualityGates("launch_plan", { ...SIMULATED_LAUNCH_PLAN, asOf: "2026-11-09", readiness }, kb);
    const g16 = r.findings.filter((f) => f.gate === "G16_launch_readiness");
    expect(g16).toEqual([expect.objectContaining({ severity: "warning", path: "$.phases[3]" })]);
    expect(g16[0]!.message).toContain("external reference");
    expect(r.passed).toBe(true);
  });

  it("a duplicate phase is critical", () => {
    const readiness = computeReadiness({ tier: "tier_1", ...dates }, READY);
    const dup = { ...SIMULATED_LAUNCH_PLAN, phases: [SIMULATED_LAUNCH_PLAN.phases[0], SIMULATED_LAUNCH_PLAN.phases[0]] };
    const r = runQualityGates("launch_plan", { ...dup, asOf: "2026-11-09", readiness }, kb);
    expect(r.passed).toBe(false);
  });
});
