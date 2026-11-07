/**
 * M13a + M13b unit tests (no DB): product assets and sales toolkit —
 * schema, simulated fixtures, the type-specific gates G11–G14, the start
 * input, the prompt and the single-step pipeline.
 */
import { describe, expect, it } from "vitest";
import { DEMO_CLAIMS, DEMO_COMPETITOR_EVIDENCE, DEMO_SOURCES, DEMO_TENANT_ID, SIMULATED_GTM_STRATEGY_BRIEF } from "@/demo/fixtures";
import { SIMULATED_ONE_PAGER_CORRECTED, simulatedEnablementAsset } from "@/demo/enablement-fixtures";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { ASSET_SCHEMAS } from "@/domain/schemas/agents";
import { ENABLEMENT_CATALOG, ENABLEMENT_TYPES, EnablementAssetV1, PRODUCT_ASSET_TYPES, SALES_TOOLKIT_TYPES } from "@/domain/schemas/enablement";
import { GtmStrategyBriefV1 } from "@/domain/schemas/strategy";
import type { AgentInput } from "@/server/agents";
import { ENABLEMENT_DELIVERABLE_TYPES, DELIVERABLE_ASSET_TYPES } from "@/server/assets/deliverables";
import { SimulatedProvider } from "@/server/llm/simulated";
import { AGENT_ENABLEMENT_PROMPT, PROMPT_TEMPLATES, renderPrompt } from "@/server/prompts";
import { preparedCorrectionFor } from "@/server/review/service";
import { CAMPAIGN_ASSET, ENABLEMENT_PROMPT_VERSIONS, StartWorkflowInput } from "@/server/workflow/input";
import { CostBudget } from "@/server/workflow/limits";
import { runEnablementPipeline } from "@/server/workflow/pipeline";
import { ASSET_TYPE_LABEL, RUN_KIND_LABEL } from "@/lib/format";

const kb = () => buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: DEMO_CLAIMS, competitorEvidence: DEMO_COMPETITOR_EVIDENCE });
const critical = (r: ReturnType<typeof runQualityGates>) => r.findings.filter((f) => f.severity === "critical");
const fixture = (t: (typeof ENABLEMENT_TYPES)[number]) => structuredClone(simulatedEnablementAsset(t)) as ReturnType<typeof EnablementAssetV1.parse>;

const base = (notes: string): AgentInput => ({
  snapshot: kb(),
  brief: { productName: "[SYNTHETIC] AI Governance module (demo)", market: "DACH mid-market", persona: "CISO", notes },
  policy: { tenantId: DEMO_TENANT_ID, externalModelsApproved: true, maxExternalModelClass: "internal" },
  sourceClassifications: ["internal"],
});

describe("M13 catalog and schema", () => {
  it("17 deliverable types in two groups, all registered with one schema and labelled", () => {
    expect(PRODUCT_ASSET_TYPES).toHaveLength(10);
    expect(SALES_TOOLKIT_TYPES).toHaveLength(7);
    for (const t of ENABLEMENT_TYPES) {
      expect(ASSET_SCHEMAS[t]).toBe(EnablementAssetV1);
      expect(ASSET_TYPE_LABEL[t]).toBe(ENABLEMENT_CATALOG[t].label);
      expect(DELIVERABLE_ASSET_TYPES).toContain(t);
    }
    expect(ENABLEMENT_DELIVERABLE_TYPES).toEqual([...ENABLEMENT_TYPES]);
    expect(RUN_KIND_LABEL[CAMPAIGN_ASSET]).toBeDefined();
  });

  it.each(ENABLEMENT_TYPES)("%s: simulated fixture validates and matches its type", (t) => {
    const parsed = EnablementAssetV1.safeParse(simulatedEnablementAsset(t));
    expect(parsed.success).toBe(true);
    expect(parsed.data!.deliverableType).toBe(t);
  });

  it.each(ENABLEMENT_TYPES.filter((t) => t !== "one_pager"))("%s: fixture passes the gates", (t) => {
    const r = runQualityGates(t, simulatedEnablementAsset(t), kb());
    expect(critical(r)).toEqual([]);
  });
});

describe("M13 gates", () => {
  it("G11: the demo one-pager quotes a number as fact without basis → blocked; the prepared correction passes", () => {
    const v1 = runQualityGates("one_pager", simulatedEnablementAsset("one_pager"), kb());
    expect(v1.passed).toBe(false);
    expect(critical(v1).map((f) => f.gate)).toContain("G11_number_basis");
    const v2 = runQualityGates("one_pager", SIMULATED_ONE_PAGER_CORRECTED, kb());
    expect(critical(v2)).toEqual([]);
  });

  it("G11: a number resting on an assumption may not be a fact; unknown assumption ids are G2", () => {
    const bad = fixture("roi_argument");
    bad.sections[0]!.blocks[0]!.statement.kind = "fact";
    bad.sections[1]!.blocks[1]!.assumptionIds = ["A9"];
    const r = runQualityGates("roi_argument", bad, kb());
    const gates = critical(r).map((f) => f.gate);
    expect(gates).toContain("G11_number_basis");
    expect(gates).toContain("G2_references_exist");
  });

  it("G11 ignores format modifiers like \"30-minute\" but not figures", async () => {
    const { containsFigure } = await import("@/domain/quality-gates/enablement-gates");
    expect(containsFigure("Book a 30-minute walkthrough.")).toBe(false);
    expect(containsFigure("Teams save 40 % of the time.")).toBe(true);
    expect(containsFigure("A team documents 25 AI systems.")).toBe(true);
  });

  it("G11 only applies to types whose numbers need a basis", () => {
    const outline = fixture("whitepaper_outline");
    outline.sections[0]!.blocks.push({ label: "Chapter 3", statement: { text: "Chapter 3: five steps to an inventory", kind: "suggestion", claimIds: [], evidence: [], competitorEvidenceIds: [], kpiRefs: [], regulatory: false, comparative: false }, assumptionIds: [] });
    expect(critical(runQualityGates("whitepaper_outline", outline, kb()))).toEqual([]);
  });

  it("G12: a named customer without documented approval blocks a case study", () => {
    const named = { ...fixture("case_study"), customerReference: { customerName: "Example Insurance AG" } };
    const r = runQualityGates("case_study", named, kb());
    expect(critical(r).map((f) => f.gate)).toContain("G12_customer_approval");
    const fake = { ...named, customerReference: { customerName: "Example Insurance AG", approvalEvidence: { sourceId: "src_demo_product_overview", excerpt: "the customer approved this case study" } } };
    expect(critical(runQualityGates("case_study", fake, kb())).map((f) => f.gate)).toContain("G12_customer_approval");
  });

  it("G13: ad fields over the hard limit are blocked, over the visible length only warned", () => {
    const ad = fixture("ad_copy");
    ad.sections[1]!.blocks[0]!.statement.text = "AI inventory checklist for every compliance team"; // > 30
    ad.sections[0]!.blocks[1]!.statement.text = "Get the AI inventory checklist for your compliance team and your CISO today"; // > 70, < 200
    const r = runQualityGates("ad_copy", ad, kb());
    expect(critical(r).some((f) => f.gate === "G13_channel_limits" && f.message.startsWith("google_headline"))).toBe(true);
    expect(r.findings.some((f) => f.gate === "G13_channel_limits" && f.severity === "warning" && f.message.startsWith("linkedin_headline"))).toBe(true);
  });

  it("G14: content of another deliverable type is blocked", () => {
    const r = runQualityGates("demo_story", simulatedEnablementAsset("one_pager"), kb());
    expect(critical(r).map((f) => f.gate)).toContain("G14_deliverable_type");
  });

  it("existing gates still apply: an absolute compliance promise in a product page is blocked", () => {
    const page = fixture("product_page");
    page.sections[0]!.blocks[0]!.statement = { ...page.sections[0]!.blocks[0]!.statement, text: "Fully compliant with the EU AI Act — guaranteed.", claimIds: [] };
    const gates = critical(runQualityGates("product_page", page, kb())).map((f) => f.gate);
    expect(gates).toContain("G5_unsupported_assertions");
  });
});

describe("M13 run input, prompt and pipeline", () => {
  it("campaign_asset input: campaign + deliverable type, strict", () => {
    expect(StartWorkflowInput.parse({ kind: "campaign_asset", campaignId: "c1", deliverableType: "roi_argument" })).toMatchObject({ kind: "campaign_asset" });
    expect(StartWorkflowInput.safeParse({ kind: "campaign_asset", campaignId: "c1", deliverableType: "messaging_framework" }).success).toBe(false);
    expect(StartWorkflowInput.safeParse({ kind: "campaign_asset", campaignId: "c1", deliverableType: "one_pager", tenantId: "t" }).success).toBe(false);
  });

  it("the prompt is registered, versioned, lists every type and its rules", () => {
    expect(PROMPT_TEMPLATES).toContain(AGENT_ENABLEMENT_PROMPT);
    expect(ENABLEMENT_PROMPT_VERSIONS).toEqual({ "agent-h.enablement-asset": "1.0.0" });
    for (const t of ENABLEMENT_TYPES) expect(AGENT_ENABLEMENT_PROMPT.system).toContain(`- ${t} (`);
    expect(AGENT_ENABLEMENT_PROMPT.system).toMatch(/assumption/i);
    expect(AGENT_ENABLEMENT_PROMPT.system).toMatch(/never invent a customer/i);
    const p = renderPrompt(AGENT_ENABLEMENT_PROMPT, { ...base("requested_deliverable_type: one_pager"), gtmStrategy: SIMULATED_GTM_STRATEGY_BRIEF });
    expect(p.user).toContain("requested_deliverable_type: one_pager");
    expect(p.user.indexOf("<gtm_strategy>")).toBeGreaterThan(p.user.indexOf("</brief>"));
    expect(p.user).toContain("<competitor_evidence>");
  });

  it("pipeline: one step, the asset type is the requested deliverable", async () => {
    const sim = new SimulatedProvider();
    const p = await runEnablementPipeline("discovery_guide")({ ...base("requested_deliverable_type: discovery_guide"), gtmStrategy: GtmStrategyBriefV1.parse(SIMULATED_GTM_STRATEGY_BRIEF) }, sim, new CostBudget(2, sim));
    expect(p.results.map((r) => r.assetType)).toEqual(["discovery_guide"]);
    expect(Object.keys(p.promptVersions)).toEqual(["agent-h.enablement-asset"]);
  });

  it("the prepared one-pager correction is offered to the demo tenant only", () => {
    expect(preparedCorrectionFor({ isDemo: true }, "one_pager")).toEqual(SIMULATED_ONE_PAGER_CORRECTED);
    expect(preparedCorrectionFor({ isDemo: false }, "one_pager")).toBeNull();
  });
});
