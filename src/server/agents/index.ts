import type { z } from "zod";
import { DomainError } from "../../domain/actor";
import type { KnowledgeSnapshot } from "../../domain/knowledge/snapshot";
import {
  CompetitiveBattlecardV1,
  MessagingFrameworkV1,
  ProductIntelligenceBriefV1,
  RegulatoryGtmBriefV1,
} from "../../domain/schemas/agents";
import { CampaignPlanV1, ContentMatrixV1, SalesPlayV1 } from "../../domain/schemas/campaign";
import { PerformanceReviewDraftV1, type KpiResult } from "../../domain/schemas/performance";
import { ReleaseCommunicationPlanV1 } from "../../domain/schemas/release";
import { GtmStrategyBriefV1, UseCaseMapV1 } from "../../domain/schemas/strategy";
import { promptClassification, type DataClassification, type ExternalModelPolicy } from "../llm/classification";
import type { LlmMode, LlmProvider, LlmUsage, OutputSpec } from "../llm/types";
import {
  AGENT_A_PROMPT,
  AGENT_B_PROMPT,
  AGENT_C_BATTLECARD_PROMPT,
  AGENT_C_REGULATORY_PROMPT,
  AGENT_D_CAMPAIGN_PLAN_PROMPT,
  AGENT_E_CONTENT_MATRIX_PROMPT,
  AGENT_F_SALES_PLAY_PROMPT,
  AGENT_G_PERFORMANCE_PROMPT,
  AGENT_RELEASE_PROMPT,
  AGENT_STRATEGY_PROMPT,
  AGENT_USE_CASE_PROMPT,
  renderPrompt,
  type AgentBrief,
  type PromptInput,
  type PromptTemplate,
} from "../prompts";

export interface AgentInput {
  snapshot: KnowledgeSnapshot;
  brief: AgentBrief;
  /** Tenant policy for external models; tenantId must match the snapshot. */
  policy: ExternalModelPolicy;
  /** Classifications of the sources in the snapshot (from Source.classification). */
  sourceClassifications: DataClassification[];
  /**
   * Agent B output for agent C (only after MessagingFrameworkV1 validation), or
   * the latest APPROVED messaging framework (same product and persona) for the campaign agents D–F.
   */
  messagingFramework?: z.infer<typeof MessagingFrameworkV1>;
  /** Agent D output for agents E and F (only after CampaignPlanV1 validation), or the approved plan for agent G. */
  campaignPlan?: z.infer<typeof CampaignPlanV1>;
  /** M11: server-computed KPI results for agent G. */
  kpiResults?: { asOf: string; results: KpiResult[] };
  /** M12: latest APPROVED use case map of the product (strategy agent). */
  useCaseMap?: z.infer<typeof UseCaseMapV1>;
  /** M12: the campaign's APPROVED GTM strategy brief (agents D–F). */
  gtmStrategy?: z.infer<typeof GtmStrategyBriefV1>;
}

/** The prompt input an agent sees: only the context blocks that are set. */
export function promptInputOf(input: AgentInput): PromptInput {
  return {
    snapshot: input.snapshot,
    brief: input.brief,
    ...(input.messagingFramework ? { messagingFramework: input.messagingFramework } : {}),
    ...(input.campaignPlan ? { campaignPlan: input.campaignPlan } : {}),
    ...(input.kpiResults ? { kpiResults: input.kpiResults } : {}),
    ...(input.useCaseMap ? { useCaseMap: input.useCaseMap } : {}),
    ...(input.gtmStrategy ? { gtmStrategy: input.gtmStrategy } : {}),
  };
}

/**
 * Schema-valid agent output plus run metadata. There is deliberately no
 * status field: approval happens only through domain decide() by a human.
 */
export interface AgentResult<T> {
  assetType: OutputSpec["assetType"];
  output: T;
  prompt: { id: string; version: string };
  llm: { mode: LlmMode; modelId: string; usage: LlmUsage; costEstimateUsd: number | null; attempts: number };
}

export const OUTPUT_SPECS = {
  product_intelligence_brief: {
    assetType: "product_intelligence_brief",
    schema: ProductIntelligenceBriefV1,
    toolName: "submit_product_intelligence_brief",
    toolDescription: "Submit the product intelligence brief (product_intelligence_brief.v1).",
  },
  messaging_framework: {
    assetType: "messaging_framework",
    schema: MessagingFrameworkV1,
    toolName: "submit_messaging_framework",
    toolDescription: "Submit the messaging framework (messaging_framework.v1).",
  },
  competitive_battlecard: {
    assetType: "competitive_battlecard",
    schema: CompetitiveBattlecardV1,
    toolName: "submit_competitive_battlecard",
    toolDescription: "Submit the competitive battlecard (competitive_battlecard.v1).",
  },
  regulatory_gtm_brief: {
    assetType: "regulatory_gtm_brief",
    schema: RegulatoryGtmBriefV1,
    toolName: "submit_regulatory_gtm_brief",
    toolDescription: "Submit the regulatory GTM brief (regulatory_gtm_brief.v1).",
  },
  campaign_plan: {
    assetType: "campaign_plan",
    schema: CampaignPlanV1,
    toolName: "submit_campaign_plan",
    toolDescription: "Submit the campaign plan (campaign_plan.v1).",
  },
  content_matrix: {
    assetType: "content_matrix",
    schema: ContentMatrixV1,
    toolName: "submit_content_matrix",
    toolDescription: "Submit the content matrix (content_matrix.v1).",
  },
  sales_play: {
    assetType: "sales_play",
    schema: SalesPlayV1,
    toolName: "submit_sales_play",
    toolDescription: "Submit the sales play (sales_play.v1).",
  },
  use_case_map: {
    assetType: "use_case_map",
    schema: UseCaseMapV1,
    toolName: "submit_use_case_map",
    toolDescription: "Submit the use case map with ICP, target segments and buying center (use_case_map.v1).",
  },
  gtm_strategy_brief: {
    assetType: "gtm_strategy_brief",
    schema: GtmStrategyBriefV1,
    toolName: "submit_gtm_strategy_brief",
    toolDescription: "Submit the GTM strategy brief of the campaign (gtm_strategy_brief.v1).",
  },
  release_communication_plan: {
    assetType: "release_communication_plan",
    schema: ReleaseCommunicationPlanV1,
    toolName: "submit_release_communication_plan",
    toolDescription: "Submit the release communication plan (release_communication_plan.v1).",
  },
  // The model writes the DRAFT; the server adds asOf + kpiSnapshot before the gates.
  performance_review: {
    assetType: "performance_review",
    schema: PerformanceReviewDraftV1,
    toolName: "submit_performance_review",
    toolDescription: "Submit the performance review (performance_review.v1, without KPI numbers — those are added by the system).",
  },
} as const satisfies Record<string, OutputSpec>;

async function runAgent<S extends z.ZodType>(
  spec: OutputSpec<S>,
  template: PromptTemplate,
  input: AgentInput,
  provider: LlmProvider,
): Promise<AgentResult<z.infer<S>>> {
  if (input.policy.tenantId !== input.snapshot.tenantId) {
    throw new DomainError("tenant_mismatch", "Agent policy and knowledge snapshot belong to different tenants.");
  }
  const prompt = renderPrompt(template, promptInputOf(input));
  const res = await provider.generate(spec, prompt, {
    dataPolicy: { tenant: input.policy, dataClassification: promptClassification(input.sourceClassifications) },
  });
  return {
    assetType: spec.assetType,
    output: res.data,
    prompt: res.prompt,
    llm: { mode: res.mode, modelId: res.modelId, usage: res.usage, costEstimateUsd: res.costEstimateUsd, attempts: res.attempts },
  };
}

/** Agent A — Product & Market Intelligence. */
export const runAgentA = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.product_intelligence_brief, AGENT_A_PROMPT, input, provider);

/** Agent B — Positioning & Messaging. */
export const runAgentB = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.messaging_framework, AGENT_B_PROMPT, input, provider);

/** Agent C — Competitive & GTM Enablement (battlecard or regulatory brief). */
export function runAgentC(input: AgentInput, provider: LlmProvider, kind: "battlecard"): Promise<AgentResult<z.infer<typeof CompetitiveBattlecardV1>>>;
export function runAgentC(input: AgentInput, provider: LlmProvider, kind: "regulatory_brief"): Promise<AgentResult<z.infer<typeof RegulatoryGtmBriefV1>>>;
export function runAgentC(input: AgentInput, provider: LlmProvider, kind: "battlecard" | "regulatory_brief") {
  return kind === "battlecard"
    ? runAgent(OUTPUT_SPECS.competitive_battlecard, AGENT_C_BATTLECARD_PROMPT, input, provider)
    : runAgent(OUTPUT_SPECS.regulatory_gtm_brief, AGENT_C_REGULATORY_PROMPT, input, provider);
}

/** Agent D — Campaign planning (F1). */
export const runAgentD = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.campaign_plan, AGENT_D_CAMPAIGN_PLAN_PROMPT, input, provider);

/** Agent E — Content & communication (F4). Receives agent D's plan when it is schema-valid. */
export const runAgentE = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.content_matrix, AGENT_E_CONTENT_MATRIX_PROMPT, input, provider);

/** Agent F — Sales, retention & loyalty enablement (F2). Receives agent D's plan when it is schema-valid. */
export const runAgentF = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.sales_play, AGENT_F_SALES_PLAY_PROMPT, input, provider);

/** Agent G — Performance analysis (F5). Writes the draft; KPI numbers come from the server. */
export const runAgentG = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.performance_review, AGENT_G_PERFORMANCE_PROMPT, input, provider);

/** M12 use case agent — use cases, ICP, target segments and buying center for one product. */
export const runUseCaseAgent = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.use_case_map, AGENT_USE_CASE_PROMPT, input, provider);

/** M12 strategy agent — GTM strategy brief, the first (human-approved) step of a campaign. */
export const runStrategyAgent = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.gtm_strategy_brief, AGENT_STRATEGY_PROMPT, input, provider);

/** M12 release agent — release and update communication plan. */
export const runReleaseAgent = (input: AgentInput, provider: LlmProvider) =>
  runAgent(OUTPUT_SPECS.release_communication_plan, AGENT_RELEASE_PROMPT, input, provider);
