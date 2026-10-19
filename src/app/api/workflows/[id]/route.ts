import { getActor } from "@/server/auth/actor";
import { jsonRoute } from "@/server/http/route";
import { getOrchestrator } from "@/server/workflow/runtime";

/** Run status, transition history (from AuditEvent) and produced asset versions. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonRoute(async () => getOrchestrator().get(await getActor(), id));
}
