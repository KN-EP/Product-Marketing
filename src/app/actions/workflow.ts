"use server";

import { z } from "zod";
import { runAction } from "@/server/http/action";
import { getOrchestrator, runInBackground } from "@/server/workflow/runtime";

const RunId = z.string().trim().min(1).max(64);

/** Start a pmm_three_asset run (same validation, idempotency and limits as POST /api/workflows). */
export async function startWorkflowAction(input: unknown) {
  return runAction(async (actor) => {
    const orchestrator = getOrchestrator();
    const { run, created } = await orchestrator.start(actor, input);
    if (created) runInBackground(() => orchestrator.execute(actor, run.id));
    return { runId: run.id, created, status: run.status };
  });
}

/** Explicit retry of a failed run: failed → queued, then executes in the background. */
export async function retryWorkflowRunAction(runId: string) {
  return runAction(async (actor) => {
    const orchestrator = getOrchestrator();
    const run = await orchestrator.retry(actor, RunId.parse(runId));
    runInBackground(() => orchestrator.execute(actor, run.id));
    return run;
  });
}

/** Admin only: mark a stale active run as failed (frees its concurrency slot). */
export async function markRunFailedAction(runId: string) {
  return runAction((actor) => getOrchestrator().markStaleRunFailed(actor, RunId.parse(runId)));
}
