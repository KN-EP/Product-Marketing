export type Role = "viewer" | "editor" | "reviewer" | "admin";

/**
 * The authenticated principal, resolved server-side from the session and the
 * user's Membership. tenantId here is the ONLY tenant a request may touch —
 * never a value taken from the URL, query string or request body.
 */
export interface Actor {
  kind: "human" | "system";
  userId: string | null;
  tenantId: string;
  role: Role;
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, reviewer: 2, admin: 3 };

export function hasRole(actor: Actor, min: Role): boolean {
  return RANK[actor.role] >= RANK[min];
}

/** Only a human with reviewer rights may make approval decisions. */
export function canReview(actor: Actor): boolean {
  return actor.kind === "human" && actor.userId !== null && hasRole(actor, "reviewer");
}

export class DomainError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "invalid_transition"
      | "insufficient_evidence"
      | "gates_failed"
      | "expert_ack_required"
      | "not_current_version"
      | "tenant_mismatch"
      | "not_approved",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
