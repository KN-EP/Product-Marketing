"use server";

import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { createRelease } from "@/server/releases/service";

/** Create a release briefing (editors, M12). Tenant from the session; a foreign product id → 404. */
export async function createReleaseAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("releaseCreate", `${actor.tenantId}:${actor.userId}`);
    return createRelease(actor, getDb(), input);
  });
}
