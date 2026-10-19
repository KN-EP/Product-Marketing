import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { assertExternalCallAllowed } from "./classification";
import { LlmError, LlmOutputInvalidError } from "./errors";
import { toolInputSchema } from "./json-schema";
import { estimateCostUsd } from "./pricing";
import {
  ZERO_USAGE,
  type GenerateOptions,
  type LlmProvider,
  type LlmResult,
  type LlmUsage,
  type OutputSpec,
  type RenderedPrompt,
} from "./types";

/** The subset of the SDK client this provider uses (lets tests inject a mock). */
export interface MessagesClient {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming, opts?: Anthropic.RequestOptions): Promise<Anthropic.Message> };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  /** From ANTHROPIC_MODEL only — never defaulted in code. */
  model: string;
  timeoutMs?: number;
  /** Retries on 429 / 5xx / connection errors (in addition to the first attempt). */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxTokens?: number;
  client?: MessagesClient;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryable(e: unknown): boolean {
  if (e instanceof Anthropic.RateLimitError) return true; // 429
  if (e instanceof Anthropic.InternalServerError) return true; // 5xx incl. 529 overloaded
  if (e instanceof Anthropic.APIUserAbortError) return false;
  if (e instanceof Anthropic.APIConnectionError) return true; // network + timeout
  return false;
}

function retryAfterMs(e: unknown): number | null {
  if (!(e instanceof Anthropic.APIError) || !e.headers) return null;
  const v = e.headers.get("retry-after");
  if (!v) return null;
  const secs = Number(v);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
}

function addUsage(acc: LlmUsage, u: Anthropic.Usage): LlmUsage {
  return {
    inputTokens: acc.inputTokens + (u.input_tokens ?? 0),
    outputTokens: acc.outputTokens + (u.output_tokens ?? 0),
    cacheReadInputTokens: acc.cacheReadInputTokens + (u.cache_read_input_tokens ?? 0),
    cacheCreationInputTokens: acc.cacheCreationInputTokens + (u.cache_creation_input_tokens ?? 0),
  };
}

/**
 * Live provider (server-only) using the official SDK. Structured output via a
 * single strict tool whose schema is derived from the Zod schema; the tool
 * input is always re-validated with Zod. tool_choice is "auto" (forced tool
 * choice is rejected by current models), so a missing tool call is re-prompted once.
 */
export class AnthropicProvider implements LlmProvider {
  readonly mode = "live" as const;
  readonly external = true;
  private readonly client: MessagesClient;
  private readonly o: Required<Omit<AnthropicProviderOptions, "client" | "apiKey">>;

  constructor(opts: AnthropicProviderOptions) {
    if (!opts.model) throw new LlmError("config", "ANTHROPIC_MODEL is not set.");
    this.o = {
      model: opts.model,
      timeoutMs: opts.timeoutMs ?? 120_000,
      maxRetries: opts.maxRetries ?? 3,
      baseDelayMs: opts.baseDelayMs ?? 1_000,
      maxDelayMs: opts.maxDelayMs ?? 30_000,
      maxTokens: opts.maxTokens ?? 16_000,
      sleep: opts.sleep ?? realSleep,
      random: opts.random ?? Math.random,
    };
    // SDK-level retries off: retries/backoff are done (and counted) here.
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: this.o.timeoutMs, maxRetries: 0 });
  }

  async generate<S extends z.ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, opts: GenerateOptions): Promise<LlmResult<z.infer<S>>> {
    // Classification gate — before anything leaves the server.
    assertExternalCallAllowed(opts.dataPolicy.tenant, opts.dataPolicy.dataClassification);

    const tool: Anthropic.Tool = {
      name: spec.toolName,
      description: spec.toolDescription,
      input_schema: toolInputSchema(spec.schema) as Anthropic.Tool.InputSchema,
      strict: true,
    };
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt.user }];
    let usage = { ...ZERO_USAGE };
    let attempts = 0;

    for (let turn = 0; turn < 2; turn++) {
      const res = await this.createWithRetry(
        {
          model: this.o.model,
          max_tokens: opts.maxTokens ?? this.o.maxTokens,
          system: prompt.system,
          messages,
          tools: [tool],
          tool_choice: { type: "auto", disable_parallel_tool_use: true },
        },
        opts.signal,
        (n) => (attempts += n),
      );
      usage = addUsage(usage, res.usage);

      if (res.stop_reason === "refusal") throw new LlmError("refusal", "The model declined the request.");
      if (res.stop_reason === "max_tokens") throw new LlmError("truncated", "Model output hit max_tokens; output discarded.");

      const call = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === spec.toolName,
      );
      if (!call) {
        // Append-only re-prompt (no history edits).
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: `Submit your answer by calling the ${spec.toolName} tool.` });
        continue;
      }

      const parsed = spec.schema.safeParse(call.input);
      if (!parsed.success) {
        throw new LlmOutputInvalidError(
          `Model output for ${spec.assetType} failed schema validation.`,
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      return {
        data: parsed.data,
        usage,
        modelId: res.model || this.o.model,
        mode: "live",
        costEstimateUsd: estimateCostUsd(res.model || this.o.model, usage),
        prompt: { id: prompt.id, version: prompt.version },
        attempts,
      };
    }
    throw new LlmError("no_tool_call", `Model did not call ${spec.toolName}.`);
  }

  private async createWithRetry(
    body: Anthropic.MessageCreateParamsNonStreaming,
    signal: AbortSignal | undefined,
    count: (n: number) => void,
  ): Promise<Anthropic.Message> {
    for (let attempt = 0; ; attempt++) {
      count(1);
      try {
        return await this.client.messages.create(body, { timeout: this.o.timeoutMs, ...(signal ? { signal } : {}) });
      } catch (e) {
        if (!isRetryable(e) || attempt >= this.o.maxRetries) {
          const status = e instanceof Anthropic.APIError ? e.status : undefined;
          throw new LlmError("provider_error", `Anthropic request failed${status ? ` (HTTP ${status})` : ""}.`, isRetryable(e));
        }
        const backoff = Math.min(this.o.maxDelayMs, this.o.baseDelayMs * 2 ** attempt) * (0.5 + this.o.random() / 2);
        await this.o.sleep(Math.min(this.o.maxDelayMs, retryAfterMs(e) ?? backoff));
      }
    }
  }
}
