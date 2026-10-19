import type { z } from "zod";
import type { AssetType } from "../../domain/schemas/agents";
import type { DataClassification, ExternalModelPolicy } from "./classification";

export type LlmMode = "live" | "simulated";

/** What the model must produce: a versioned asset schema plus the tool that carries it. */
export interface OutputSpec<S extends z.ZodType = z.ZodType> {
  assetType: AssetType;
  schema: S;
  /** Tool name the model calls with the structured output. */
  toolName: string;
  toolDescription: string;
}

/** A rendered, versioned prompt. id + version are recorded on every run. */
export interface RenderedPrompt {
  id: string;
  version: string;
  system: string;
  user: string;
}

export interface GenerateOptions {
  /**
   * Required: checked before any external call (see classification.ts). The
   * provider refuses to send data that the tenant's policy does not allow.
   */
  dataPolicy: { tenant: ExternalModelPolicy; dataClassification: DataClassification };
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface LlmResult<T> {
  /** Re-validated with the Zod schema; unknown keys (e.g. a model-supplied "status") are stripped. */
  data: T;
  usage: LlmUsage;
  modelId: string;
  mode: LlmMode;
  /** USD estimate; null when no price is known for the model. */
  costEstimateUsd: number | null;
  prompt: { id: string; version: string };
  /** API requests made (retries and re-prompts included). */
  attempts: number;
}

export interface LlmProvider {
  readonly mode: LlmMode;
  /** True when generate() sends data outside this server. */
  readonly external: boolean;
  /** Model the provider will call (known before any call; used for cost pre-checks). */
  readonly modelId: string;
  /** Upper bound on output tokens per request. */
  readonly maxTokens: number;
  generate<S extends z.ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, opts: GenerateOptions): Promise<LlmResult<z.infer<S>>>;
}

/** Requests one generate() may make in the worst case: first call + one re-prompt. */
export const MAX_REQUESTS_PER_GENERATE = 2;

export const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
