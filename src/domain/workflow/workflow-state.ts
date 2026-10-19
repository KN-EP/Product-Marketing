import { DomainError } from "../actor";

/**
 * Workflow status describes the RUN, not the content. "completed" means the
 * run finished and its outputs are in human review — never that content is
 * approved. Content approval lives exclusively on AssetVersion/Approval.
 */
export type WorkflowStatus =
  | "created"
  | "queued"
  | "running"
  | "validation"
  | "pending_review"
  | "completed"
  | "failed";

const NEXT: Record<WorkflowStatus, WorkflowStatus[]> = {
  created: ["queued", "failed"],
  queued: ["running", "failed"],
  running: ["validation", "failed", "queued"], // queued = retry
  validation: ["pending_review", "failed"],
  pending_review: ["completed", "failed"],
  completed: [],
  failed: ["queued"], // explicit retry
};

export function assertWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!NEXT[from].includes(to)) {
    throw new DomainError("invalid_transition", `Workflow cannot move from ${from} to ${to}`);
  }
}

export const WORKFLOW_LIMITS = {
  maxAttempts: 3,
  modelTimeoutMs: 90_000,
  maxConcurrentRunsPerTenant: 2,
  maxCostUsdPerRun: 2.0,
} as const;

/**
 * Deterministic idempotency key: the same inputs within the same tenant map to
 * the same run, so a double-click or retried request reuses the existing run.
 * Backed by @@unique([tenantId, idempotencyKey]) in the database.
 */
export async function idempotencyKey(parts: {
  tenantId: string;
  kind: string;
  productId: string;
  personaId: string;
  market: string;
  regulatoryTriggerId: string;
  competitorIds: string[];
  promptVersions: Record<string, string>;
  requestNonce?: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    ...parts,
    competitorIds: [...parts.competitorIds].sort(),
    promptVersions: Object.fromEntries(Object.entries(parts.promptVersions).sort()),
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}
