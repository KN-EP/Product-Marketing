"use server";

import { getDb } from "@/server/db";
import { createCampaign } from "@/server/campaigns/service";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";

/** Create a campaign briefing (editors). Tenant from the session; product/persona ids → 404 when foreign. */
export async function createCampaignAction(input: unknown) {
  return runAction((actor) => {
    enforceRateLimit("campaignCreate", `${actor.tenantId}:${actor.userId}`);
    return createCampaign(actor, getDb(), input);
  });
}
