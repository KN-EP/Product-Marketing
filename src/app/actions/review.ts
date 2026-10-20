"use server";

import { z } from "zod";
import { getDb } from "@/server/db";
import { runAction } from "@/server/http/action";
import { enforceRateLimit } from "@/server/http/rate-limit";
import {
  createDraftVersion,
  decideAsset,
  exportAssetMarkdown,
  submitAssetForReview,
  transitionClaimState,
} from "@/server/review/service";

const Id = z.string().trim().min(1).max(64);

export async function submitForReviewAction(assetId: string) {
  return runAction((actor) => submitAssetForReview(actor, getDb(), Id.parse(assetId)));
}

const DecideInput = z.strictObject({
  assetId: Id,
  versionId: Id,
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  comment: z.string().trim().max(4000).optional(),
  expertReviewAcknowledged: z.boolean().optional(),
});

export async function decideAction(input: z.input<typeof DecideInput>) {
  return runAction((actor) => {
    enforceRateLimit("decision", `${actor.tenantId}:${actor.userId}`);
    return decideAsset(actor, getDb(), DecideInput.parse(input));
  });
}

const Origin = z.enum(["human_edit", "prepared_correction_simulated"]).default("human_edit");

/**
 * Saves the editor content as a NEW version (human_edit). `origin` only labels
 * the audit event; "prepared_correction_simulated" is accepted for a demo
 * tenant's battlecard only (checked server-side).
 */
export async function createDraftVersionAction(assetId: string, content: unknown, origin?: z.input<typeof Origin>) {
  return runAction((actor) => createDraftVersion(actor, getDb(), { assetId: Id.parse(assetId), content, origin: Origin.parse(origin) }));
}

export async function exportMarkdownAction(assetId: string) {
  return runAction((actor) => exportAssetMarkdown(actor, getDb(), Id.parse(assetId)));
}

const ClaimInput = z.strictObject({
  claimId: Id,
  to: z.enum(["draft", "pending_review", "approved", "rejected", "stale"]),
  reason: z.string().trim().max(2000).optional(),
});

export async function transitionClaimAction(input: z.input<typeof ClaimInput>) {
  return runAction((actor) => {
    enforceRateLimit("decision", `${actor.tenantId}:${actor.userId}`);
    return transitionClaimState(actor, getDb(), ClaimInput.parse(input));
  });
}
