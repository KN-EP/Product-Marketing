import { canReview, DomainError, hasRole, type Actor } from "../actor";
import type { KnowledgeSnapshot } from "../knowledge/snapshot";
import { runQualityGates, type GateReport } from "../quality-gates/gates";
import type { AssetType } from "../schemas/agents";

export type AssetState = "draft" | "pending_review" | "changes_requested" | "approved" | "archived";
export type GenerationMode = "live" | "simulated";
export type Decision = "approved" | "rejected" | "changes_requested";

export interface AssetVersionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly assetId: string;
  readonly versionNumber: number;
  readonly schemaVersion: string;
  readonly content: unknown;
  readonly gateReport: GateReport;
  readonly gatesPassed: boolean;
  readonly generationMode: GenerationMode;
  readonly createdAt: Date;
}

export interface ApprovalRecord {
  assetVersionId: string;
  reviewerId: string;
  decision: Decision;
  comment: string | null;
  createdAt: Date;
}

export interface AssetRecord {
  id: string;
  tenantId: string;
  type: AssetType;
  title: string;
  state: AssetState;
  currentVersionId: string | null;
  versions: readonly AssetVersionRecord[];
  approvals: readonly ApprovalRecord[];
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

function assertTenant(asset: AssetRecord, actor: Actor) {
  // Same error as "not found" to avoid leaking existence across tenants.
  if (asset.tenantId !== actor.tenantId) throw new DomainError("tenant_mismatch", "Asset not found");
}

export function currentVersion(asset: AssetRecord): AssetVersionRecord | undefined {
  return asset.versions.find((v) => v.id === asset.currentVersionId);
}

/**
 * Create a new immutable version (from a workflow run or a human edit). Gates
 * are run here, server-side; any status the model put into its output is ignored.
 * Editing an approved asset never touches the approved version.
 */
export function addVersion(
  asset: AssetRecord,
  content: unknown,
  actor: Actor,
  kb: KnowledgeSnapshot,
  opts: { id: string; generationMode: GenerationMode; now?: Date },
): AssetRecord {
  assertTenant(asset, actor);
  if (actor.kind === "human" && !hasRole(actor, "editor")) throw new DomainError("forbidden", "Insufficient role");
  if (asset.state === "archived") throw new DomainError("invalid_transition", "Asset is archived");
  const now = opts.now ?? new Date();
  const report = runQualityGates(asset.type, content, kb, now);
  const version: AssetVersionRecord = deepFreeze({
    id: opts.id,
    tenantId: asset.tenantId,
    assetId: asset.id,
    versionNumber: asset.versions.length + 1,
    schemaVersion: (content as { schemaVersion?: string })?.schemaVersion ?? "unknown",
    content: structuredClone(content),
    gateReport: report,
    gatesPassed: report.passed,
    generationMode: opts.generationMode,
    createdAt: now,
  });
  return { ...asset, state: "draft", currentVersionId: version.id, versions: [...asset.versions, version] };
}

export function submitForReview(asset: AssetRecord, actor: Actor): AssetRecord {
  assertTenant(asset, actor);
  if (!(asset.state === "draft" || asset.state === "changes_requested")) {
    throw new DomainError("invalid_transition", `Cannot submit from ${asset.state}`);
  }
  if (!currentVersion(asset)) throw new DomainError("invalid_transition", "No version to review");
  return { ...asset, state: "pending_review" };
}

export interface DecisionInput {
  versionId: string;
  decision: Decision;
  comment?: string;
  /** Reviewer confirms regulatory statements were checked by a qualified expert. */
  expertReviewAcknowledged?: boolean;
  now?: Date;
}

export function decide(
  asset: AssetRecord,
  actor: Actor,
  kb: KnowledgeSnapshot,
  input: DecisionInput,
): { asset: AssetRecord; approval: ApprovalRecord; gateReport?: GateReport } {
  assertTenant(asset, actor);
  if (!canReview(actor)) throw new DomainError("forbidden", "Only a human reviewer can decide on assets");
  if (asset.state !== "pending_review") {
    throw new DomainError("invalid_transition", `Asset is ${asset.state}, not pending_review`);
  }
  const version = currentVersion(asset);
  if (!version || version.id !== input.versionId) {
    throw new DomainError("not_current_version", "Decisions apply only to the current version under review");
  }
  if (input.decision !== "approved" && !input.comment?.trim()) {
    throw new DomainError("invalid_transition", "A comment is required when rejecting or requesting changes");
  }

  const now = input.now ?? new Date();
  let gateReport: GateReport | undefined;
  if (input.decision === "approved") {
    // Re-run gates against the CURRENT knowledge base: a claim may have become
    // stale since the version was generated.
    gateReport = runQualityGates(asset.type, version.content, kb, now);
    if (!gateReport.passed) {
      const n = gateReport.findings.filter((f) => f.severity === "critical").length;
      throw new DomainError("gates_failed", `${n} critical finding(s) block approval`);
    }
    if (gateReport.requiresExpertReview && !input.expertReviewAcknowledged) {
      throw new DomainError("expert_ack_required", "Regulatory statements require confirmed expert review");
    }
  }

  const approval: ApprovalRecord = {
    assetVersionId: version.id,
    reviewerId: actor.userId!,
    decision: input.decision,
    comment: input.comment?.trim() || null,
    createdAt: now,
  };
  const nextState: AssetState =
    input.decision === "approved" ? "approved" : input.decision === "changes_requested" ? "changes_requested" : "draft";
  return { asset: { ...asset, state: nextState, approvals: [...asset.approvals, approval] }, approval, gateReport };
}

/** The most recent approved version, independent of later drafts. */
export function latestApprovedVersion(asset: AssetRecord): { version: AssetVersionRecord; approval: ApprovalRecord } | undefined {
  for (let i = asset.approvals.length - 1; i >= 0; i--) {
    const a = asset.approvals[i]!;
    if (a.decision === "approved") {
      const v = asset.versions.find((x) => x.id === a.assetVersionId);
      if (v) return { version: v, approval: a };
    }
  }
  return undefined;
}
