import "server-only";
import { after } from "next/server";
import { WORKFLOW_LIMITS } from "../../domain/workflow/workflow-state";
import { getDb } from "../db";
import { createLlmProvider } from "../llm";
import { InProcessOrchestrator, type OrchestratorAdapter } from "./orchestrator";

const g = globalThis as unknown as { __pmmOrchestrator?: OrchestratorAdapter };

export function getOrchestrator(): OrchestratorAdapter {
  g.__pmmOrchestrator ??= new InProcessOrchestrator({
    db: getDb(),
    provider: () => createLlmProvider(process.env, { timeoutMs: WORKFLOW_LIMITS.modelTimeoutMs }).provider,
  });
  return g.__pmmOrchestrator;
}

/**
 * Runs a task after the response is sent (Next.js `after`). Outside a request
 * scope (scripts, tests) it simply runs detached. Errors are logged by name
 * only; the run itself records a sanitized error.
 */
export function runInBackground(task: () => Promise<unknown>): void {
  const safe = () =>
    task().catch((e: unknown) => console.error("[workflow] background task failed:", e instanceof Error ? e.name : "unknown error"));
  try {
    after(safe);
  } catch {
    void safe();
  }
}
