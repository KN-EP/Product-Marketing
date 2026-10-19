/** M5 unit tests (no DB, simulated/fake providers only): limits, pipeline, failure handling. */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  DEMO_CLAIMS,
  DEMO_COMPETITOR_EVIDENCE,
  DEMO_SOURCES,
  DEMO_TENANT_ID,
  SIMULATED_BATTLECARD_CORRECTED,
  SIMULATED_MESSAGING_FRAMEWORK,
  SIMULATED_PRODUCT_INTELLIGENCE_BRIEF,
  SIMULATED_REGULATORY_BRIEF,
} from "@/demo/fixtures";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { WORKFLOW_LIMITS } from "@/domain/workflow/workflow-state";
import type { AgentInput } from "@/server/agents";
import { LlmError, LlmOutputInvalidError } from "@/server/llm/errors";
import { SimulatedProvider } from "@/server/llm/simulated";
import type { GenerateOptions, LlmProvider, LlmResult, OutputSpec, RenderedPrompt } from "@/server/llm/types";
import { sanitizeError, WorkflowLimitError } from "@/server/workflow/errors";
import { PROMPT_VERSIONS, StartWorkflowInput } from "@/server/workflow/input";
import { assertCanRetry, assertConcurrencyAvailable, CostBudget, costCapUsd } from "@/server/workflow/limits";
import { newProgress, runPmmPipeline } from "@/server/workflow/pipeline";

const base = (): AgentInput => ({
  snapshot: buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: DEMO_CLAIMS, competitorEvidence: DEMO_COMPETITOR_EVIDENCE }),
  brief: { productName: "[SYNTHETIC] AI Governance module (demo)", market: "DACH", persona: "CISO" },
  policy: { tenantId: DEMO_TENANT_ID, externalModelsApproved: true, maxExternalModelClass: "internal" },
  sourceClassifications: ["internal"],
});

const FIXTURES: Record<string, unknown> = {
  product_intelligence_brief: SIMULATED_PRODUCT_INTELLIGENCE_BRIEF,
  messaging_framework: SIMULATED_MESSAGING_FRAMEWORK,
  competitive_battlecard: SIMULATED_BATTLECARD_CORRECTED,
  regulatory_gtm_brief: SIMULATED_REGULATORY_BRIEF,
};

/** A "live" provider that never touches the network: fixed cost per call, records prompts. */
class FakeLiveProvider implements LlmProvider {
  readonly mode = "live" as const;
  readonly external = true;
  readonly maxTokens = 16_000;
  calls: { assetType: string; prompt: RenderedPrompt }[] = [];
  constructor(
    readonly modelId = "claude-opus-5-5",
    private readonly costPerCall: number | null = 0.5,
    private readonly override: (assetType: string) => unknown = (t) => FIXTURES[t],
    private readonly failOn?: string,
  ) {}
  async generate<S extends z.ZodType>(spec: OutputSpec<S>, prompt: RenderedPrompt, _o: GenerateOptions): Promise<LlmResult<z.infer<S>>> {
    this.calls.push({ assetType: spec.assetType, prompt });
    if (this.failOn === spec.assetType) throw new LlmOutputInvalidError("Model output failed schema validation.", [{ path: "pillars", message: "Required" }]);
    return {
      data: structuredClone(this.override(spec.assetType)) as z.infer<S>,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      modelId: this.modelId,
      mode: "live",
      costEstimateUsd: this.costPerCall,
      prompt: { id: prompt.id, version: prompt.version },
      attempts: 1,
    };
  }
}

describe("cost cap", () => {
  it("LLM_MAX_COST_USD_PER_RUN applies but never exceeds WORKFLOW_LIMITS", () => {
    expect(costCapUsd({})).toBe(WORKFLOW_LIMITS.maxCostUsdPerRun);
    expect(costCapUsd({ LLM_MAX_COST_USD_PER_RUN: "0.5" })).toBe(0.5);
    expect(costCapUsd({ LLM_MAX_COST_USD_PER_RUN: "50" })).toBe(WORKFLOW_LIMITS.maxCostUsdPerRun);
    expect(costCapUsd({ LLM_MAX_COST_USD_PER_RUN: "nonsense" })).toBe(WORKFLOW_LIMITS.maxCostUsdPerRun);
  });

  it("aborts BEFORE the step that could exceed the cap; spend never exceeds it", async () => {
    const provider = new FakeLiveProvider("claude-opus-5-5", 0.5);
    const budget = new CostBudget(2.0, provider);
    const progress = newProgress();
    const err = await runPmmPipeline(base(), provider, budget, progress).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorkflowLimitError);
    expect((err as WorkflowLimitError).limit).toBe("cost_cap");
    // worst case per step ≈ 2 × (16k × $20/M) ≈ $0.65 → A, B, C1 run ($1.50), C2 would risk > $2.00
    expect(provider.calls.map((c) => c.assetType)).toEqual(["product_intelligence_brief", "messaging_framework", "competitive_battlecard"]);
    expect(progress.costUsd).toBe(1.5);
    expect(progress.costUsd).toBeLessThanOrEqual(2.0);
  });

  it("a live model without a documented price fails closed (cap not enforceable)", () => {
    expect(() => new CostBudget(2, new FakeLiveProvider("some-unpriced-model"))).toThrow(/cannot be enforced/);
  });

  it("a live call without a cost estimate fails closed", async () => {
    const provider = new FakeLiveProvider("claude-opus-5-5", null);
    await expect(runPmmPipeline(base(), provider, new CostBudget(2, provider))).rejects.toMatchObject({ limit: "cost_unenforceable" });
  });

  it("simulated runs cost nothing and are never capped", async () => {
    const sim = new SimulatedProvider();
    const p = await runPmmPipeline(base(), sim, new CostBudget(0.0001, sim));
    expect(p.costUsd).toBe(0);
    expect(p.results).toHaveLength(4);
  });
});

describe("pipeline A → B → C", () => {
  it("produces the four assets in order and records prompt versions", async () => {
    const sim = new SimulatedProvider();
    const p = await runPmmPipeline(base(), sim, new CostBudget(2, sim));
    expect(p.results.map((r) => r.assetType)).toEqual([
      "product_intelligence_brief",
      "messaging_framework",
      "competitive_battlecard",
      "regulatory_gtm_brief",
    ]);
    expect(p.promptVersions).toEqual(PROMPT_VERSIONS);
    expect(p.messagingFrameworkPassedToC).toBe(true);
  });

  it("agent C receives B's output only when it is schema-valid", async () => {
    const valid = new FakeLiveProvider("claude-opus-5-5", 0.01);
    await runPmmPipeline(base(), valid, new CostBudget(2, valid));
    const cPrompts = valid.calls.filter((c) => c.assetType === "competitive_battlecard" || c.assetType === "regulatory_gtm_brief");
    expect(cPrompts.every((c) => c.prompt.user.includes("<messaging_framework>"))).toBe(true);

    const broken = new FakeLiveProvider("claude-opus-5-5", 0.01, (t) =>
      t === "messaging_framework" ? { ...SIMULATED_MESSAGING_FRAMEWORK, pillars: [] } : FIXTURES[t],
    );
    const p = await runPmmPipeline(base(), broken, new CostBudget(2, broken));
    expect(p.messagingFrameworkPassedToC).toBe(false);
    const cPrompts2 = broken.calls.filter((c) => c.assetType === "competitive_battlecard" || c.assetType === "regulatory_gtm_brief");
    expect(cPrompts2.some((c) => c.prompt.user.includes("<messaging_framework>"))).toBe(false);
  });

  it("a failing step stops the chain and keeps partial usage for the run record", async () => {
    const provider = new FakeLiveProvider("claude-opus-5-5", 0.1, (t) => FIXTURES[t], "messaging_framework");
    const progress = newProgress();
    await expect(runPmmPipeline(base(), provider, new CostBudget(2, provider), progress)).rejects.toBeInstanceOf(LlmOutputInvalidError);
    expect(progress.results).toHaveLength(1);
    expect(progress.costUsd).toBeCloseTo(0.1);
    expect(progress.usage.inputTokens).toBe(100);
  });
});

describe("concurrency limit and retry rules", () => {
  it("rejects a run beyond maxConcurrentRunsPerTenant with 429", () => {
    expect(() => assertConcurrencyAvailable(WORKFLOW_LIMITS.maxConcurrentRunsPerTenant - 1)).not.toThrow();
    const err = (() => {
      try {
        assertConcurrencyAvailable(WORKFLOW_LIMITS.maxConcurrentRunsPerTenant);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(WorkflowLimitError);
    expect(err).toMatchObject({ status: 429, limit: "concurrency_limit" });
  });

  it("retry only for failed runs with attempts left", () => {
    expect(() => assertCanRetry({ status: "failed", attempts: 1 })).not.toThrow();
    expect(() => assertCanRetry({ status: "failed", attempts: WORKFLOW_LIMITS.maxAttempts })).toThrow(/all 3 attempts/);
    expect(() => assertCanRetry({ status: "completed", attempts: 1 })).toThrow(/Only failed runs/);
    expect(() => assertCanRetry({ status: "running", attempts: 1 })).toThrow(/Only failed runs/);
  });
});

describe("failed-run error sanitization", () => {
  it("unknown errors never leak their message (could contain SQL, URLs, secrets)", () => {
    const e = new Error("connect failed postgresql://pmm_app:s3cret@db.example:5432/pmm_os SELECT * FROM \"Claim\"");
    const s = sanitizeError(e);
    expect(s).toBe("internal_error: The run failed unexpectedly. See server logs.");
    expect(s).not.toMatch(/s3cret|postgresql|SELECT/);
  });

  it("known errors keep code + our own message; invalid output lists field paths only", () => {
    expect(sanitizeError(new LlmError("refusal", "The model declined the request."))).toBe("refusal: The model declined the request.");
    const invalid = sanitizeError(
      new LlmOutputInvalidError("Model output for messaging_framework failed schema validation.", [{ path: "pillars.0.title", message: "secret-ish model text" }]),
    );
    expect(invalid).toContain("pillars.0.title");
    expect(invalid).not.toContain("secret-ish");
  });

  it("caps stored error length", () => {
    expect(sanitizeError(new LlmError("provider_error", "x".repeat(2000))).length).toBeLessThanOrEqual(500);
  });
});

describe("start input", () => {
  const valid = {
    productId: "prd_demo_ai_governance",
    personaId: "per_demo_ciso",
    market: "DACH mid-market",
    regulatoryTriggerId: "rtr_demo_eu_ai_act",
    competitorIds: ["cmp_a", "cmp_b", "cmp_c"],
  };
  it("accepts the documented shape and defaults the kind", () => {
    expect(StartWorkflowInput.parse(valid).kind).toBe("pmm_three_asset");
  });
  it.each([
    ["a tenantId field", { ...valid, tenantId: "tnt_other_demo" }],
    ["two competitors", { ...valid, competitorIds: ["cmp_a", "cmp_b"] }],
    ["duplicate competitors", { ...valid, competitorIds: ["cmp_a", "cmp_a", "cmp_b"] }],
    ["another kind", { ...valid, kind: "something_else" }],
  ])("rejects %s", (_l, input) => {
    expect(StartWorkflowInput.safeParse(input).success).toBe(false);
  });
});
