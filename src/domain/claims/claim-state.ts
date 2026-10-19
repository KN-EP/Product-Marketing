import { canReview, DomainError, hasRole, type Actor } from "../actor";
import {
  excerptExistsInSource,
  type ClaimRecord,
  type ClaimState,
  type KnowledgeSnapshot,
} from "../knowledge/snapshot";

const TRANSITIONS: Record<ClaimState, ClaimState[]> = {
  draft: ["pending_review"],
  pending_review: ["approved", "rejected", "draft"],
  approved: ["stale", "draft"],
  rejected: ["draft"],
  stale: ["pending_review", "draft"],
};

export interface ClaimTransitionResult {
  claim: ClaimRecord;
  audit: { action: string; entityType: "Claim"; entityId: string; actorId: string | null; metadata: Record<string, unknown> };
  reviewerId?: string;
  approvedAt?: Date;
  lastVerifiedAt?: Date;
}

/** Evidence adequacy: ≥1 evidence item, every excerpt present in an active, owned source. */
export function evidenceProblems(claim: ClaimRecord, kb: KnowledgeSnapshot): string[] {
  const problems: string[] = [];
  if (claim.evidence.length === 0) problems.push("Claim has no evidence");
  for (const ev of claim.evidence) {
    const src = kb.sources.get(ev.sourceId);
    if (!src) problems.push(`Unknown source ${ev.sourceId}`);
    else if (src.status !== "active") problems.push(`Source ${src.id} is ${src.status}`);
    else if (!excerptExistsInSource(ev.excerpt, src)) problems.push(`Excerpt not found in source ${src.id}`);
  }
  return problems;
}

export function transitionClaim(
  claim: ClaimRecord,
  to: ClaimState,
  actor: Actor,
  kb: KnowledgeSnapshot,
  opts: { reason?: string; now?: Date } = {},
): ClaimTransitionResult {
  const now = opts.now ?? new Date();
  if (claim.tenantId !== actor.tenantId || kb.tenantId !== actor.tenantId) {
    throw new DomainError("tenant_mismatch", "Claim not found");
  }
  if (!TRANSITIONS[claim.state].includes(to)) {
    throw new DomainError("invalid_transition", `Cannot move claim from ${claim.state} to ${to}`);
  }
  if ((to === "approved" || to === "rejected") && !canReview(actor)) {
    throw new DomainError("forbidden", "Only a human reviewer can approve or reject claims");
  }
  if (to !== "stale" && !hasRole(actor, "editor")) {
    throw new DomainError("forbidden", "Insufficient role");
  }
  if (to === "approved") {
    const problems = evidenceProblems(claim, kb);
    if (problems.length > 0) {
      throw new DomainError("insufficient_evidence", problems.join("; "));
    }
  }

  const result: ClaimTransitionResult = {
    claim: { ...claim, state: to },
    audit: {
      action: `claim.${to}`,
      entityType: "Claim",
      entityId: claim.id,
      actorId: actor.userId,
      metadata: { from: claim.state, to, ...(opts.reason ? { reason: opts.reason } : {}) },
    },
  };
  if (to === "approved") {
    result.reviewerId = actor.userId!;
    result.approvedAt = now;
    result.lastVerifiedAt = now;
  }
  return result;
}

/**
 * A source changed or became invalid: approved/pending claims that depend on it
 * become stale for re-review. This does NOT assert they are false.
 */
export function claimsToMarkStale(sourceId: string, claims: Iterable<ClaimRecord>): ClaimRecord[] {
  const out: ClaimRecord[] = [];
  for (const c of claims) {
    if ((c.state === "approved" || c.state === "pending_review") && c.evidence.some((e) => e.sourceId === sourceId)) {
      out.push({ ...c, state: "stale" });
    }
  }
  return out;
}
