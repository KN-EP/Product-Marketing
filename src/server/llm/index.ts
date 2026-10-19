import "server-only";
import { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic";
import { SimulatedProvider } from "./simulated";
import type { LlmProvider } from "./types";

type Env = Record<string, string | undefined>;

export type LlmModeDecision =
  | { mode: "live"; apiKey: string; model: string }
  | { mode: "simulated"; reason: "llm_mode_simulated" | "missing_api_key" | "missing_model" };

/**
 * Live only when LLM_MODE=live AND ANTHROPIC_API_KEY AND ANTHROPIC_MODEL are
 * all set. Anything else falls back to simulated (acceptance test I) — the
 * reason is shown in the UI banner. The model ID is never defaulted in code.
 */
export function decideLlmMode(env: Env = process.env): LlmModeDecision {
  if (env.LLM_MODE !== "live") return { mode: "simulated", reason: "llm_mode_simulated" };
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { mode: "simulated", reason: "missing_api_key" };
  const model = env.ANTHROPIC_MODEL?.trim();
  if (!model) return { mode: "simulated", reason: "missing_model" };
  return { mode: "live", apiKey, model };
}

export const FALLBACK_MESSAGES: Record<Extract<LlmModeDecision, { mode: "simulated" }>["reason"], string> = {
  llm_mode_simulated: "Simulated mode (LLM_MODE is not \"live\"). Outputs are synthetic fixtures.",
  missing_api_key: "Simulated mode: ANTHROPIC_API_KEY is not set. Outputs are synthetic fixtures.",
  missing_model: "Simulated mode: ANTHROPIC_MODEL is not set. Outputs are synthetic fixtures.",
};

export function createLlmProvider(
  env: Env = process.env,
  overrides: Partial<Omit<AnthropicProviderOptions, "apiKey" | "model">> = {},
): { provider: LlmProvider; decision: LlmModeDecision } {
  const decision = decideLlmMode(env);
  if (decision.mode === "simulated") return { provider: new SimulatedProvider(), decision };
  return {
    provider: new AnthropicProvider({ apiKey: decision.apiKey, model: decision.model, ...overrides }),
    decision,
  };
}

/** Banner text for the UI: null when live. */
export function llmBanner(env: Env = process.env): string | null {
  const d = decideLlmMode(env);
  return d.mode === "simulated" ? FALLBACK_MESSAGES[d.reason] : null;
}
