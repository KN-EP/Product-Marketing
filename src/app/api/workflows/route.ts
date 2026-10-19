import { getActor } from "@/server/auth/actor";
import { JsonResult, jsonRoute, readJsonBody } from "@/server/http/route";
import { getOrchestrator, runInBackground } from "@/server/workflow/runtime";

/**
 * Start a pmm_three_asset run. 202 + queued run when created (execution
 * continues after the response); 200 + the existing run for a repeated request.
 */
export async function POST(req: Request) {
  return jsonRoute(async () => {
    const actor = await getActor();
    const body = await readJsonBody(req);
    const orchestrator = getOrchestrator();
    const { run, created } = await orchestrator.start(actor, body);
    if (created) runInBackground(() => orchestrator.execute(actor, run.id));
    return new JsonResult({ run, created }, created ? 202 : 200);
  });
}
