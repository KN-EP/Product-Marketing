"use server";

import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { createLaunch, decideLaunchPhase, updateLaunchProof } from "@/server/launches/service";

/** Create a launch briefing (editors, M15). Tenant from the session; foreign product/release ids → 404. */
export async function createLaunchAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("launchWrite", `${actor.tenantId}:${actor.userId}`);
    return createLaunch(actor, getDb(), input);
  });
}

/** Update the proof of a launch: external references, documented internal pilot (editors, M15). */
export async function updateLaunchProofAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("launchWrite", `${actor.tenantId}:${actor.userId}`);
    return updateLaunchProof(actor, getDb(), input);
  });
}

/** Go / no-go for one launch phase (reviewers, M15). Readiness is recomputed on the server. */
export async function decideLaunchPhaseAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("decision", `${actor.tenantId}:${actor.userId}`);
    return decideLaunchPhase(actor, getDb(), input);
  });
}
