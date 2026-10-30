import { AGENT_A_PROMPT } from "./agent-a";
import { AGENT_B_PROMPT } from "./agent-b";
import { AGENT_C_BATTLECARD_PROMPT, AGENT_C_REGULATORY_PROMPT } from "./agent-c";
import { AGENT_D_CAMPAIGN_PLAN_PROMPT, AGENT_E_CONTENT_MATRIX_PROMPT, AGENT_F_SALES_PLAY_PROMPT } from "./campaign";
import type { PromptInput, PromptTemplate } from "./common";
import { AGENT_G_PERFORMANCE_PROMPT } from "./performance";
import { AGENT_RELEASE_PROMPT } from "./release";
import { AGENT_STRATEGY_PROMPT, AGENT_USE_CASE_PROMPT } from "./strategy";
import type { RenderedPrompt } from "../llm/types";

export {
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
};
export type { AgentBrief, PromptInput, PromptTemplate } from "./common";

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  AGENT_A_PROMPT,
  AGENT_B_PROMPT,
  AGENT_C_BATTLECARD_PROMPT,
  AGENT_C_REGULATORY_PROMPT,
  AGENT_D_CAMPAIGN_PLAN_PROMPT,
  AGENT_E_CONTENT_MATRIX_PROMPT,
  AGENT_F_SALES_PLAY_PROMPT,
  AGENT_G_PERFORMANCE_PROMPT,
  AGENT_USE_CASE_PROMPT,
  AGENT_STRATEGY_PROMPT,
  AGENT_RELEASE_PROMPT,
];

export function renderPrompt(t: PromptTemplate, input: PromptInput): RenderedPrompt {
  return { id: t.id, version: t.version, system: t.system, user: t.render(input) };
}
