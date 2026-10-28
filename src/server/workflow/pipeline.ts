import { MessagingFrameworkV1 } from "../../domain/schemas/agents";
import { CampaignPlanV1 } from "../../domain/schemas/campaign";
import {
  promptInputOf,
  runAgentA,
  runAgentB,
  runAgentC,
  runAgentD,
  runAgentE,
  runAgentF,
  type AgentInput,
  type AgentResult,
} from "../agents";
import { ZERO_USAGE, type LlmProvider, type LlmUsage } from "../llm/types";
import {
  AGENT_A_PROMPT,
  AGENT_B_PROMPT,
  AGENT_C_BATTLECARD_PROMPT,
  AGENT_C_REGULATORY_PROMPT,
  AGENT_D_CAMPAIGN_PLAN_PROMPT,
  AGENT_E_CONTENT_MATRIX_PROMPT,
  AGENT_F_SALES_PLAY_PROMPT,
  renderPrompt,
  type PromptTemplate,
} from "../prompts";
import type { CostBudget } from "./limits";

/** Mutable progress so a failed run still records what it spent. */
export interface PipelineProgress {
  results: AgentResult<unknown>[];
  usage: LlmUsage;
  costUsd: number;
  llmRequests: number;
  modelId: string | null;
  promptVersions: Record<string, string>;
  /** Whether agent B's output was schema-valid and handed to agent C. */
  messagingFrameworkPassedToC: boolean | null;
  /** campaign_gtm: whether agent D's plan was schema-valid and handed to agents E and F. */
  campaignPlanPassedOn: boolean | null;
}

export function newProgress(): PipelineProgress {
  return {
    results: [],
    usage: { ...ZERO_USAGE },
    costUsd: 0,
    llmRequests: 0,
    modelId: null,
    promptVersions: {},
    messagingFrameworkPassedToC: null,
    campaignPlanPassedOn: null,
  };
}

function promptChars(t: PromptTemplate, input: AgentInput): number {
  const p = renderPrompt(t, promptInputOf(input));
  return p.system.length + p.user.length;
}

type Step = <T>(template: PromptTemplate, input: AgentInput, run: () => Promise<AgentResult<T>>) => Promise<AgentResult<T>>;

/** One agent call: cost reservation before, accounting and heartbeat after. */
function stepper(budget: CostBudget, progress: PipelineProgress, onStep?: () => Promise<unknown>): Step {
  return async (template, input, run) => {
    budget.reserve(promptChars(template, input));
    const r = await run();
    budget.record(r.llm.costEstimateUsd);
    progress.results.push(r);
    progress.usage = {
      inputTokens: progress.usage.inputTokens + r.llm.usage.inputTokens,
      outputTokens: progress.usage.outputTokens + r.llm.usage.outputTokens,
      cacheReadInputTokens: progress.usage.cacheReadInputTokens + r.llm.usage.cacheReadInputTokens,
      cacheCreationInputTokens: progress.usage.cacheCreationInputTokens + r.llm.usage.cacheCreationInputTokens,
    };
    progress.costUsd = budget.spentUsd;
    progress.llmRequests += r.llm.attempts;
    progress.modelId = r.llm.modelId;
    progress.promptVersions[r.prompt.id] = r.prompt.version;
    await onStep?.();
    return r;
  };
}

/**
 * A → B → C (battlecard, regulatory brief). Pure orchestration: no database.
 * The cost cap is checked before every model call; agent C only receives B's
 * output after it re-validates against MessagingFrameworkV1.
 */
export async function runPmmPipeline(
  base: AgentInput,
  provider: LlmProvider,
  budget: CostBudget,
  progress: PipelineProgress = newProgress(),
  /** Called after every completed agent step (heartbeat). */
  onStep?: () => Promise<unknown>,
): Promise<PipelineProgress> {
  const step = stepper(budget, progress, onStep);

  await step(AGENT_A_PROMPT, base, () => runAgentA(base, provider));
  const b = await step(AGENT_B_PROMPT, base, () => runAgentB(base, provider));

  const mf = MessagingFrameworkV1.safeParse(b.output);
  progress.messagingFrameworkPassedToC = mf.success;
  const cInput: AgentInput = mf.success ? { ...base, messagingFramework: mf.data } : base;

  await step(AGENT_C_BATTLECARD_PROMPT, cInput, () => runAgentC(cInput, provider, "battlecard"));
  await step(AGENT_C_REGULATORY_PROMPT, cInput, () => runAgentC(cInput, provider, "regulatory_brief"));
  return progress;
}

/**
 * campaign_gtm: D (campaign plan) → E (content matrix) → F (sales play).
 * Same accounting as A → B → C. E and F only receive D's plan after it
 * re-validates against CampaignPlanV1; an approved messaging framework for the same
 * product and persona (if the caller found one) is passed to all three as context.
 */
export async function runCampaignPipeline(
  base: AgentInput,
  provider: LlmProvider,
  budget: CostBudget,
  progress: PipelineProgress = newProgress(),
  onStep?: () => Promise<unknown>,
): Promise<PipelineProgress> {
  const step = stepper(budget, progress, onStep);
  const d = await step(AGENT_D_CAMPAIGN_PLAN_PROMPT, base, () => runAgentD(base, provider));

  const plan = CampaignPlanV1.safeParse(d.output);
  progress.campaignPlanPassedOn = plan.success;
  const next: AgentInput = plan.success ? { ...base, campaignPlan: plan.data } : base;

  await step(AGENT_E_CONTENT_MATRIX_PROMPT, next, () => runAgentE(next, provider));
  await step(AGENT_F_SALES_PLAY_PROMPT, next, () => runAgentF(next, provider));
  return progress;
}
