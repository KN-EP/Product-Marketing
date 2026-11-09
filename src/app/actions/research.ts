"use server";

import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import { recordInterview, withdrawConsent } from "@/server/research/service";

/** Record a win/loss interview (editors, M14). Tenant from the session; foreign product/competitor ids → 404. */
export async function recordInterviewAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("researchWrite", `${actor.tenantId}:${actor.userId}`);
    return recordInterview(actor, getDb(), input);
  });
}

/** Withdraw an interviewee's consent: notes erased, source invalid, interview excluded (editors, M14). */
export async function withdrawConsentAction(interviewId: unknown) {
  return runAction((actor) => {
    enforceRateLimit("researchWrite", `${actor.tenantId}:${actor.userId}`);
    return withdrawConsent(actor, getDb(), interviewId);
  });
}
