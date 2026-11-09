/**
 * M15 station "Launch": a SYNTHETIC staged launch for the demo tenant and the
 * simulated launch agent. Mirrors a common situation: a new module, tier 1,
 * only internal use so far ("customer zero"), no external reference yet.
 */
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "./fixtures";

const S = (
  text: string,
  kind: "fact" | "interpretation" | "hypothesis" | "suggestion",
  extra: Partial<{ claimIds: string[]; evidence: { sourceId: string; excerpt: string }[] }> = {},
) => ({ text, kind, claimIds: [] as string[], evidence: [] as { sourceId: string; excerpt: string }[], competitorEvidenceIds: [] as string[], kpiRefs: [] as string[], regulatory: false, comparative: false, ...extra });

export const DEMO_LAUNCHES = [
  {
    id: "lnc_demo_ai_monitoring",
    tenantId: DEMO_TENANT_ID,
    productId: "prd_demo_ai_governance",
    name: "[SYNTHETIC] AI usage monitoring module",
    tier: "tier_1" as const,
    summary: "[SYNTHETIC] A new module that keeps the AI system register current from usage signals. Used internally so far; no external customer yet.",
    pricingModel: "[SYNTHETIC] Included in the premium plan; available as a separate module for the base plan",
    targetSegments: "[SYNTHETIC] Regulated mid-sized companies that already use the AI system register",
    /** Days from the seed date. */
    offsets: { earlyAccessOn: 7, generalAvailabilityOn: 50, customerLaunchOn: 65, marketLaunchOn: 110 },
    externalReferences: 0,
    internalPilot: true,
  },
  {
    id: "lnc_other_demo",
    tenantId: OTHER_TENANT_ID,
    productId: "prd_other_demo",
    name: "[SYNTHETIC] Other tenant launch",
    tier: "tier_3" as const,
    summary: "[SYNTHETIC] Isolation test record for launches.",
    pricingModel: "[SYNTHETIC] n/a",
    targetSegments: "[SYNTHETIC] n/a",
    offsets: { earlyAccessOn: null, generalAvailabilityOn: 30, customerLaunchOn: null, marketLaunchOn: null },
    externalReferences: 0,
    internalPilot: false,
  },
] as const;

/** Simulated launch agent: a staged plan that never says "go" and plans how to earn external proof. */
export const SIMULATED_LAUNCH_PLAN = {
  schemaVersion: "launch_plan.v1",
  tierRationale: S(
    "A new, separately priced module for the core segment justifies a tier-1 launch — but only as the last phase, once customer proof exists.",
    "suggestion",
  ),
  launchNarrative: S(
    "The AI system register stays current without manual chasing: every AI system keeps a risk category and a responsible owner.",
    "suggestion",
    { claimIds: ["clm_register", "clm_risk_owner"] },
  ),
  phases: [
    {
      phase: "early_access",
      timing: "Early-access start",
      owner: "Product marketing with customer success",
      objective: S("Earn the first external proof: invite existing register customers to early access in exchange for feedback and reference rights.", "suggestion"),
      audiences: ["Selected existing customers", "Customer success"],
      activities: [
        S("Select early-access candidates with customer success; agree feedback calls and reference rights in writing.", "suggestion"),
        S("Document the internal pilot (customer zero) as an internal case — not as a customer reference.", "suggestion"),
      ],
      exitCriteria: ["Early-access agreements signed", "Feedback calls scheduled", "Internal pilot documented"],
    },
    {
      phase: "general_availability",
      timing: "GA date",
      owner: "Product management with product marketing",
      objective: S("Make the module available with approved messaging and an enabled sales and support team.", "suggestion"),
      audiences: ["Sales", "Support", "Customer success"],
      activities: [
        S("Enablement session for sales and support before any external announcement.", "suggestion"),
        S("Publish release notes and the in-product notice once the messaging framework is approved.", "suggestion"),
      ],
      exitCriteria: ["Messaging framework approved", "Sales and support enabled", "Release notes approved"],
    },
    {
      phase: "customer_launch",
      timing: "Two weeks after GA",
      owner: "Customer success",
      objective: S("Offer the module to existing customers first — upgrade path from the base plan.", "suggestion"),
      audiences: ["Existing customers", "Partners & resellers"],
      activities: [S("Upsell campaign to register customers with the approved sales toolkit; webinar with an in-house expert.", "suggestion")],
      exitCriteria: ["Sales toolkit approved", "Upsell campaign approved"],
    },
    {
      phase: "market_launch",
      timing: "After the first references",
      owner: "Product marketing",
      objective: S("Launch to new customers only when external references and an approved battlecard exist.", "suggestion"),
      audiences: ["Prospects in regulated mid-sized companies"],
      activities: [S("Campaign with named references (documented customer approval) and the approved battlecard.", "suggestion")],
      exitCriteria: ["At least one external reference with documented approval", "Battlecard approved", "Go decision recorded"],
    },
  ],
  proofPlan: [
    {
      gap: "No external reference customer yet",
      action: S("Turn early-access participants into references: agree reference rights in the early-access terms and record their approval before naming them.", "suggestion"),
    },
    {
      gap: "Usage benefit not measured yet",
      action: S("Measure the time to a complete register in early access instead of promising a figure.", "suggestion"),
    },
  ],
  enablementPlan: [
    { audience: "Sales", deliverable: "Discovery guide and demo story", dueBy: "Before GA" },
    { audience: "Support", deliverable: "FAQ and help-centre article", dueBy: "Before GA" },
    { audience: "Customer success", deliverable: "Upgrade play for base-plan customers", dueBy: "Before the customer launch" },
  ],
  successSignals: [
    { phase: "early_access", signal: "Early-access customers actively use the module and agree to feedback calls" },
    { phase: "customer_launch", signal: "Upgrade conversations started by customer success" },
    { phase: "market_launch", signal: "Prospects reference the module in first meetings" },
  ],
  risks: ["Market phase planned before any external reference exists", "Pricing for the base plan not yet confirmed"],
  openQuestions: ["Which customers join early access?", "Is the separate module price confirmed?"],
  approvalChecklist: [
    "No phase is described as approved or ready — go / no-go is decided on the launch page",
    "Customer zero is presented as internal proof only",
    "No customer named without documented approval",
    "Synthetic sources replaced before external use",
  ],
};
