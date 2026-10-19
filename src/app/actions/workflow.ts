"use server";

import { z } from "zod";
import { runAction } from "@/server/http/action";
import { getOrchestrator, runInBackground } from "@/server/workflow/runtime";

/** Explicit retry of a failed run: failed → queued, then executes in the background. */
export async function retryWorkflowRunAction(runId: string) {
  return runAction(async (actor) => {
    const orchestrator = getOrchestrator();
    const run = await orchestrator.retry(actor, z.string().trim().min(1).max(64).parse(runId));
    runInBackground(() => orchestrator.execute(actor, run.id));
    return run;
  });
}
