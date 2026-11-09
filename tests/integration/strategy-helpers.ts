/**
 * M12: the campaign package needs an APPROVED GTM strategy brief. Shared by the
 * campaign, KPI and strategy integration tests: run campaign_strategy and
 * approve its brief as the reviewer (expert acknowledgement), via the domain
 * service — the same path as the decide action.
 */
import { randomUUID } from "node:crypto";
import type { Actor } from "@/domain/actor";
import { getDb } from "@/server/db";
import { SimulatedProvider } from "@/server/llm/simulated";
import { decideAsset } from "@/server/review/service";
import { InProcessOrchestrator } from "@/server/workflow/orchestrator";

export async function approveStrategy(editor: Actor, campaignId: string): Promise<{ assetId: string; versionId: string }> {
  const o = new InProcessOrchestrator({ db: getDb(), provider: () => new SimulatedProvider() });
  const { run } = await o.start(editor, { kind: "campaign_strategy", campaignId, requestNonce: randomUUID() });
  await o.execute(editor, run.id);
  const out = (await o.get(editor, run.id)).outputs.find((x) => x.assetType === "gtm_strategy_brief");
  if (!out) throw new Error("strategy run produced no brief");
  const reviewer: Actor = { ...editor, userId: editor.userId!.replace(/_editor$/, "_reviewer"), role: "reviewer" };
  await decideAsset(reviewer, getDb(), { assetId: out.assetId, versionId: out.versionId, decision: "approved", expertReviewAcknowledged: true });
  return { assetId: out.assetId, versionId: out.versionId };
}
