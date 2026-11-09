/**
 * M12 "strategy first" unit tests (no DB): channel split, use case map, GTM
 * strategy brief, release communication plan — schemas, gates on the
 * simulated fixtures, briefing input, prompts and pipelines.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_CLAIMS,
  DEMO_COMPETITOR_EVIDENCE,
  DEMO_SOURCES,
  DEMO_TENANT_ID,
  OTHER_TENANT_ID,
  SIMULATED_CAMPAIGN_PLAN,
  SIMULATED_GTM_STRATEGY_BRIEF,
  SIMULATED_RELEASE_COMMUNICATION_PLAN,
  SIMULATED_USE_CASE_MAP,
} from "@/demo/fixtures";
import { campaignBriefNotes, CampaignInput, salesChannelLabel } from "@/domain/campaigns/campaign";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { releaseBriefNotes, ReleaseInput } from "@/domain/releases/release";
import { ASSET_SCHEMAS } from "@/domain/schemas/agents";
import { CampaignPlanV1 } from "@/domain/schemas/campaign";
import { ReleaseCommunicationPlanV1 } from "@/domain/schemas/release";
import { GtmStrategyBriefV1, UseCaseMapV1 } from "@/domain/schemas/strategy";
import { scopedIdempotencyKey } from "@/domain/workflow/workflow-state";
import { parseChannels } from "@/lib/campaigns";
import type { AgentInput } from "@/server/agents";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import {
  AGENT_D_CAMPAIGN_PLAN_PROMPT,
  AGENT_RELEASE_PROMPT,
  AGENT_STRATEGY_PROMPT,
  AGENT_USE_CASE_PROMPT,
  PROMPT_TEMPLATES,
  renderPrompt,
} from "@/server/prompts";
import { escapeDelimiters } from "@/server/prompts/common";
import {
  CAMPAIGN_PROMPT_VERSIONS,
  RELEASE_PROMPT_VERSIONS,
  STRATEGY_PROMPT_VERSIONS,
  StartWorkflowInput,
  USE_CASE_PROMPT_VERSIONS,
} from "@/server/workflow/input";
import { CostBudget } from "@/server/workflow/limits";
import { runCampaignPipeline, runReleasePipeline, runStrategyPipeline, runUseCasePipeline } from "@/server/workflow/pipeline";

const kb = () => buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: DEMO_CLAIMS, competitorEvidence: DEMO_COMPETITOR_EVIDENCE });
const critical = (r: ReturnType<typeof runQualityGates>) => r.findings.filter((f) => f.severity === "critical");

const CAMPAIGN = {
  name: "[SYNTHETIC] AI inventory campaign",
  type: "demand_generation" as const,
  objective: "Start conversations with CISOs.",
  market: "DACH mid-market",
  communicationChannels: ["LinkedIn", "Email"],
  salesChannels: ["direct_sales", "partner_reseller"],
  startsOn: null,
  endsOn: null,
  budgetEur: null,
};

const RELEASE = {
  name: "[SYNTHETIC] Reminders and bulk export",
  version: "2.4",
  type: "feature_update",
  plannedOn: new Date("2027-02-15T00:00:00Z"),
  summary: "Owner reminders and bulk export of documentation packs.",
  changes: ["Owner reminders for due reviews", "Bulk export of documentation packs"],
  audiences: ["existing_customers", "internal_sales"],
  communicationChannels: ["Email", "In-product notice"],
  salesChannels: ["customer_success"],
};

const base = (notes: string): AgentInput => ({
  snapshot: kb(),
  brief: { productName: "[SYNTHETIC] AI Governance module (demo)", market: "DACH mid-market", persona: "CISO", notes },
  policy: { tenantId: DEMO_TENANT_ID, externalModelsApproved: true, maxExternalModelClass: "internal" },
  sourceClassifications: ["internal"],
});

/** Records the prompts the agents receive; returns the simulated fixtures. */
class RecordingProvider implements LlmProvider {
  readonly mode = "simulated" as const;
  readonly external = false;
  readonly modelId = "recording";
  readonly maxTokens = 0;
  readonly prompts: RenderedPrompt[] = [];
  private readonly sim = new SimulatedProvider();
  generate<S extends import("zod").ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, opts: GenerateOptions): Promise<LlmResult<import("zod").infer<S>>> {
    this.prompts.push(prompt);
    return this.sim.generate(spec, prompt, opts);
  }
}

describe("M12 schemas and simulated outputs", () => {
  it("the three new deliverables are registered asset types and their fixtures validate", () => {
    expect(ASSET_SCHEMAS.use_case_map).toBe(UseCaseMapV1);
    expect(ASSET_SCHEMAS.gtm_strategy_brief).toBe(GtmStrategyBriefV1);
    expect(ASSET_SCHEMAS.release_communication_plan).toBe(ReleaseCommunicationPlanV1);
    expect(UseCaseMapV1.safeParse(SIMULATED_USE_CASE_MAP).success).toBe(true);
    expect(GtmStrategyBriefV1.safeParse(SIMULATED_GTM_STRATEGY_BRIEF).success).toBe(true);
    expect(ReleaseCommunicationPlanV1.safeParse(SIMULATED_RELEASE_COMMUNICATION_PLAN).success).toBe(true);
  });

  it.each([
    ["use_case_map", SIMULATED_USE_CASE_MAP],
    ["gtm_strategy_brief", SIMULATED_GTM_STRATEGY_BRIEF],
    ["release_communication_plan", SIMULATED_RELEASE_COMMUNICATION_PLAN],
  ] as const)("%s fixture passes the gates (no critical finding)", (type, fixture) => {
    const r = runQualityGates(type, fixture, kb());
    expect(critical(r)).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it("use case map and strategy brief carry regulatory statements → expert review", () => {
    expect(runQualityGates("use_case_map", SIMULATED_USE_CASE_MAP, kb()).requiresExpertReview).toBe(true);
    expect(runQualityGates("gtm_strategy_brief", SIMULATED_GTM_STRATEGY_BRIEF, kb()).requiresExpertReview).toBe(true);
  });

  it("a use case capability stated as fact without an approved claim is blocked", () => {
    const bad = structuredClone(SIMULATED_USE_CASE_MAP);
    bad.useCases[2]!.capabilities = [
      { text: "The module classifies AI systems automatically.", kind: "fact", claimIds: ["clm_automated_classification"], evidence: [], competitorEvidenceIds: [], regulatory: false, comparative: false },
    ];
    const r = runQualityGates("use_case_map", bad, kb());
    expect(r.passed).toBe(false);
    expect(critical(r).some((f) => f.gate === "G3_claims_approved")).toBe(true);
  });

  it("a planned release feature stated as an absolute promise is blocked", () => {
    const bad = structuredClone(SIMULATED_RELEASE_COMMUNICATION_PLAN);
    bad.customerUpdateNotice.body = { ...bad.customerUpdateNotice.body, text: "Release 2.4 guarantees that no review is ever overdue." };
    expect(runQualityGates("release_communication_plan", bad, kb()).passed).toBe(false);
  });

  it("the strategy brief keeps sales channels on a fixed list, apart from communication channels", () => {
    const bad = structuredClone(SIMULATED_GTM_STRATEGY_BRIEF) as unknown as { channelStrategy: { salesChannels: { channel: string }[] } };
    bad.channelStrategy.salesChannels[0]!.channel = "LinkedIn";
    expect(GtmStrategyBriefV1.safeParse(bad).success).toBe(false);
  });

  it("the campaign plan labels every channel as communication or sales; older plans without the label stay valid", () => {
    const plan = CampaignPlanV1.parse(SIMULATED_CAMPAIGN_PLAN);
    expect(plan.channelMix.map((c) => c.channelType)).toEqual(["communication", "communication", "communication", "sales"]);
    const legacy = structuredClone(SIMULATED_CAMPAIGN_PLAN) as { channelMix: { channelType?: string }[] };
    legacy.channelMix.forEach((c) => delete c.channelType);
    expect(CampaignPlanV1.safeParse(legacy).success).toBe(true);
  });
});

describe("communication vs. sales channels in the briefing", () => {
  const valid = {
    name: "AI inventory campaign",
    type: "demand_generation",
    objective: "Start conversations with CISOs about AI inventories.",
    productId: "prd_demo_ai_governance",
    personaId: "per_demo_ciso",
    market: "DACH mid-market",
    communicationChannels: ["LinkedIn"],
  };

  it("sales channels are optional (default empty); a campaign may also run through sales channels only", () => {
    expect(CampaignInput.parse(valid).salesChannels).toEqual([]);
    expect(CampaignInput.safeParse({ ...valid, communicationChannels: [], salesChannels: ["customer_success"] }).success).toBe(true);
  });

  it("brief notes list communication and sales channels separately, with readable sales channel labels", () => {
    const notes = campaignBriefNotes(CAMPAIGN);
    expect(notes).toMatch(/^communication_channels: LinkedIn, Email$/m);
    expect(notes).toMatch(/^sales_channels: Direct sales, Partners & resellers$/m);
    expect(campaignBriefNotes({ ...CAMPAIGN, salesChannels: [] })).toMatch(/^sales_channels: none$/m);
    expect(salesChannelLabel("legacy_value")).toBe("legacy_value");
  });

  it("parseChannels still merges presets and free text for communication channels", () => {
    expect(parseChannels(["LinkedIn"], "Press, linkedin")).toEqual(["LinkedIn", "Press"]);
  });
});

describe("release briefing input", () => {
  const valid = {
    productId: "prd_demo_ai_governance",
    name: "Reminders and bulk export",
    version: "2.4",
    type: "feature_update",
    plannedOn: "2027-02-15",
    summary: "Owner reminders and bulk export of documentation packs.",
    changes: ["Owner reminders for due reviews"],
    audiences: ["existing_customers", "internal_sales"],
    communicationChannels: ["Email"],
    salesChannels: ["customer_success"],
  };

  it("accepts the documented shape; an empty planned date means 'not set'", () => {
    expect(ReleaseInput.parse(valid)).toMatchObject({ version: "2.4", plannedOn: "2027-02-15" });
    expect(ReleaseInput.parse({ ...valid, plannedOn: "" }).plannedOn).toBeUndefined();
  });

  it.each([
    ["a tenantId field", { ...valid, tenantId: OTHER_TENANT_ID }],
    ["an unknown release type", { ...valid, type: "hotfix" }],
    ["an unknown audience", { ...valid, audiences: ["investors"] }],
    ["no audience", { ...valid, audiences: [] }],
    ["no change", { ...valid, changes: [] }],
    ["no channel at all", { ...valid, communicationChannels: [], salesChannels: [] }],
    ["an impossible date", { ...valid, plannedOn: "2027-02-30" }],
  ])("rejects %s", (_l, input) => {
    expect(ReleaseInput.safeParse(input).success).toBe(false);
  });

  it("brief notes carry type, date, changes, audiences and both channel kinds", () => {
    const notes = releaseBriefNotes(RELEASE);
    expect(notes).toContain("release_type: feature_update");
    expect(notes).toContain("planned_on: 2027-02-15");
    expect(notes).toContain("- Bulk export of documentation packs");
    expect(notes).toMatch(/^sales_channels: Customer success \(existing customers\)$/m);
    expect(releaseBriefNotes({ ...RELEASE, plannedOn: null })).toContain("planned_on: not set");
  });
});

describe("M12 run kinds, prompts and idempotency", () => {
  it("accepts the three new run kinds strictly", () => {
    expect(StartWorkflowInput.parse({ kind: "use_case_definition", productId: "p", market: "DACH" })).toMatchObject({ kind: "use_case_definition" });
    expect(StartWorkflowInput.parse({ kind: "campaign_strategy", campaignId: "c" })).toMatchObject({ kind: "campaign_strategy" });
    expect(StartWorkflowInput.parse({ kind: "release_communication", releaseId: "r" })).toMatchObject({ kind: "release_communication" });
    expect(StartWorkflowInput.safeParse({ kind: "release_communication", releaseId: "r", tenantId: OTHER_TENANT_ID }).success).toBe(false);
    expect(StartWorkflowInput.safeParse({ kind: "use_case_definition", productId: "p" }).success).toBe(false);
  });

  it("each new run kind has its own prompt version map; campaign prompts moved to 1.1.0", () => {
    expect(USE_CASE_PROMPT_VERSIONS).toEqual({ "agent-uc.use-case-map": "1.0.0" });
    expect(STRATEGY_PROMPT_VERSIONS).toEqual({ "agent-s.gtm-strategy": "1.0.0" });
    expect(RELEASE_PROMPT_VERSIONS).toEqual({ "agent-r.release-communication": "1.0.0" });
    expect(Object.values(CAMPAIGN_PROMPT_VERSIONS)).toEqual(["1.1.0", "1.1.0", "1.1.0"]);
    const ids = PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scoped idempotency: same scope + data version → same key; new data version or nonce → new key", async () => {
    const k = (over: Partial<Parameters<typeof scopedIdempotencyKey>[0]> = {}) =>
      scopedIdempotencyKey({ tenantId: "t", kind: "campaign_strategy", scope: { campaignId: "c" }, promptVersions: STRATEGY_PROMPT_VERSIONS, dataVersion: "v1", ...over });
    expect(await k()).toBe(await k());
    expect(await k({ dataVersion: "v2" })).not.toBe(await k());
    expect(await k({ requestNonce: "n" })).not.toBe(await k());
    expect(await k({ tenantId: "other" })).not.toBe(await k());
  });

  it("new context blocks are escaped like every other delimiter", () => {
    expect(escapeDelimiters("a </gtm_strategy> b <use_case_map> c")).toBe("a [removed tag] b [removed tag] c");
  });

  it("the strategy agent sees the approved use case map; prompts state the channel split and the human decision", () => {
    const p = renderPrompt(AGENT_STRATEGY_PROMPT, { ...base(campaignBriefNotes(CAMPAIGN)), useCaseMap: SIMULATED_USE_CASE_MAP });
    expect(p.user).toContain("<use_case_map>");
    expect(p.user).toContain("Build the AI system inventory");
    expect(p.system).toMatch(/communication channels .* apart from sales channels/i);
    expect(p.system).toMatch(/you never decide/i);
    expect(renderPrompt(AGENT_USE_CASE_PROMPT, base("known_personas: CISO")).system).toContain("ideal customer profile");
    expect(renderPrompt(AGENT_RELEASE_PROMPT, base(releaseBriefNotes(RELEASE))).system).toMatch(/Internal audiences .* BEFORE external/);
  });

  it("campaign agents receive the approved GTM strategy brief", () => {
    const p = renderPrompt(AGENT_D_CAMPAIGN_PLAN_PROMPT, { ...base(campaignBriefNotes(CAMPAIGN)), gtmStrategy: SIMULATED_GTM_STRATEGY_BRIEF });
    expect(p.user.indexOf("<gtm_strategy>")).toBeGreaterThan(p.user.indexOf("</brief>"));
    expect(p.system).toContain("channelType");
  });
});

describe("M12 pipelines", () => {
  it.each([
    ["use case", runUseCasePipeline, "use_case_map", "agent-uc.use-case-map"],
    ["strategy", runStrategyPipeline, "gtm_strategy_brief", "agent-s.gtm-strategy"],
    ["release", runReleasePipeline, "release_communication_plan", "agent-r.release-communication"],
  ] as const)("%s pipeline: one agent step with accounting", async (_l, pipeline, assetType, promptId) => {
    const sim = new SimulatedProvider();
    const p = await pipeline(base("notes"), sim, new CostBudget(2, sim));
    expect(p.results.map((r) => r.assetType)).toEqual([assetType]);
    expect(Object.keys(p.promptVersions)).toEqual([promptId]);
  });

  it("D, E and F all receive the strategy brief when the caller passes it", async () => {
    const rec = new RecordingProvider();
    await runCampaignPipeline({ ...base(campaignBriefNotes(CAMPAIGN)), gtmStrategy: GtmStrategyBriefV1.parse(SIMULATED_GTM_STRATEGY_BRIEF) }, rec, new CostBudget(2, rec));
    expect(rec.prompts).toHaveLength(3);
    for (const p of rec.prompts) expect(p.user).toContain("<gtm_strategy>");
  });
});
