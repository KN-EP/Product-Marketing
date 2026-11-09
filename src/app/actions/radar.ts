"use server";

import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { recordRegulatoryChange, resolveRegulatoryChange } from "@/server/radar/service";

/** Record a regulatory change on a watched item (editors, M16). Foreign watch id → 404. */
export async function recordRegulatoryChangeAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("radarWrite", `${actor.tenantId}:${actor.userId}`);
    return recordRegulatoryChange(actor, getDb(), input);
  });
}

/** Resolve an open regulatory alert once its stale claims are handled (reviewers, M16). */
export async function resolveRegulatoryChangeAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("radarWrite", `${actor.tenantId}:${actor.userId}`);
    return resolveRegulatoryChange(actor, getDb(), input);
  });
}
