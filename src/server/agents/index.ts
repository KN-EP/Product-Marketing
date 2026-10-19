import type { z } from "zod";
import { DomainError } from "../../domain/actor";
import type { KnowledgeSnapshot } from "../../domain/knowledge/snapshot";
import {
  CompetitiveBattlecardV1,
  MessagingFrameworkV1,
  ProductIntelligenceBriefV1,
  RegulatoryGtmBriefV1,
} from "../../domain/schemas/agents";
import { promptClassification, type DataClassification, type ExternalModelPolicy } from "../llm/classification";
import type { LlmMode, LlmProvider, LlmUsage, OutputSpec } from "../llm/types";
import {
  AGENT_A_PROMPT,
  AGENT_B_PROMPT,
  AGENT_C_BATTLECARD_PROMPT,
  AGENT_C_REGULATORY_PROMPT,
  renderPrompt,
  type AgentBrief,
  type PromptTemplate,
} from "../prompts";

export interface AgentInput {
  snapshot: KnowledgeSnapshot;
  brief: AgentBrief;
  /** Tenant policy for external models; tenantId must match the snapshot. */
  policy: ExternalModelPolicy;
  /** Classifications of the sources in the snapshot (from Source.classification). */
  sourceClassifications: DataClassification[];
  /** Agent B output for agent C. Only pass it after MessagingFrameworkV1 validation. */
  messagingFramework?: z.infer<typeof MessagingFrameworkV1>;
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
  const prompt = renderPrompt(template, {
    snapshot: input.snapshot,
    brief: input.brief,
    ...(input.messagingFramework ? { messagingFramework: input.messagingFramework } : {}),
  });
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
