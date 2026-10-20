import { randomUUID } from "node:crypto";
import { hasRole, type Actor } from "../../domain/actor";
import { ACTIVE_RUN_STATUSES } from "../db/tenant-scope";
import { addVersion, currentVersion, submitForReview, type AssetRecord } from "../../domain/assets/asset-state";
import type { AssetType } from "../../domain/schemas/agents";
import { idempotencyKey, WORKFLOW_LIMITS, type WorkflowStatus } from "../../domain/workflow/workflow-state";
import { Prisma } from "../../generated/prisma/client";
import type { Db } from "../db/client";
import { tenantDb, withTenantTx, type TenantDb } from "../db/tenant-scope";
import { HttpError } from "../errors";
import type { LlmProvider } from "../llm/types";
import { INPUT_BRIEF_LABEL, isInternalAssetType } from "../assets/deliverables";
import { log } from "../log";
import { sanitizeError } from "./errors";
import { PMM_THREE_ASSET, PROMPT_VERSIONS, StartWorkflowInput, type RunInputRefs } from "./input";
import { assertCanRetry, assertConcurrencyAvailable, CostBudget, costCapUsd } from "./limits";
import { newProgress, runPmmPipeline } from "./pipeline";

type Env = Record<string, string | undefined>;

export interface RunSummary {
  id: string;
  kind: string;
  status: WorkflowStatus;
  /** Runs are live or simulated; human_edit only ever applies to asset versions. */
  generationMode: "live" | "simulated" | "human_edit";
  modelId: string | null;
  promptVersions: unknown;
  inputRefs: unknown;
  usage: unknown;
  costEstimateUsd: number | null;
  attempts: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface RunDetails {
  run: RunSummary;
  history: { action: string; at: Date; metadata: unknown }[];
  /** internal = the Agent A input brief (not a deliverable, never reviewed or exported). */
  outputs: { assetId: string; versionId: string; assetType: string; assetState: string; title: string; gatesPassed: boolean; internal: boolean }[];
}

/**
 * The seam for a future external orchestrator (e.g. n8n): the app only talks
 * to this interface. Tenant and actor always come from the caller's session.
 */
export interface OrchestratorAdapter {
  /** Validates input, resolves ids (404), enforces idempotency + concurrency; the run ends up queued. */
  start(actor: Actor, input: unknown): Promise<{ run: RunSummary; created: boolean }>;
  /** Runs a queued run to completed or failed. */
  execute(actor: Actor, runId: string): Promise<RunSummary>;
  /** Explicit retry: failed → queued (attempts and concurrency permitting). */
  retry(actor: Actor, runId: string): Promise<RunSummary>;
  /** Admin only: an active run with no progress for STALE_RUN_AFTER_MS → failed. */
  markStaleRunFailed(actor: Actor, runId: string): Promise<RunSummary>;
  /** Marks the tenant's stale runs failed (runs automatically on every workflow request). */
  sweepStaleRuns(actor: Actor): Promise<number>;
  get(actor: Actor, runId: string): Promise<RunDetails>;
}

const ASSET_LABEL: Record<AssetType, string> = {
  product_intelligence_brief: "Product intelligence brief",
  messaging_framework: "Messaging framework",
  competitive_battlecard: "Competitive battlecard",
  regulatory_gtm_brief: "Regulatory GTM brief",
};

/** An active run whose row has not changed for this long is considered stale. */
export const STALE_RUN_AFTER_MS = 10 * 60 * 1000;

export const STALE_AUTO_ERROR = "stale: No progress for 10 minutes; marked as failed automatically. Retry if needed.";

export function isStale(run: { status: WorkflowStatus; updatedAt: Date }, now: Date): boolean {
  return ACTIVE_RUN_STATUSES.includes(run.status) && now.getTime() - run.updatedAt.getTime() >= STALE_RUN_AFTER_MS;
}

const systemActor = (tenantId: string): Actor => ({ kind: "system", userId: null, tenantId, role: "editor" });

function requireEditor(actor: Actor) {
  if (!hasRole(actor, "editor")) throw new HttpError(403, "forbidden", "Editor role required.");
}

type RunRow = Awaited<ReturnType<TenantDb["workflowRuns"]["getById"]>>;

function summary(r: RunRow): RunSummary {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    generationMode: r.generationMode,
    modelId: r.modelId,
    promptVersions: r.promptVersions,
    inputRefs: r.inputRefs,
    usage: r.usage,
    costEstimateUsd: r.costEstimateUsd === null ? null : r.costEstimateUsd.toNumber(),
    attempts: r.attempts,
    error: r.error,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  };
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export class InProcessOrchestrator implements OrchestratorAdapter {
  constructor(
    private readonly deps: {
      db: Db;
      /** Called per execution so the LLM mode follows the current configuration. */
      provider: () => LlmProvider;
      env?: Env;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /** Resolves every referenced id through the tenant-scoped DAL (404 on any miss). */
  private async resolve(tdb: TenantDb, refs: RunInputRefs) {
    const [product, persona, trigger, competitors] = await Promise.all([
      tdb.products.getById(refs.productId),
      tdb.personas.getById(refs.personaId),
      tdb.regulatoryTriggers.getById(refs.regulatoryTriggerId),
      Promise.all(refs.competitorIds.map((id) => tdb.competitors.getById(id))),
    ]);
    return { product, persona, trigger, competitors };
  }

  async start(actor: Actor, raw: unknown): Promise<{ run: RunSummary; created: boolean }> {
    requireEditor(actor);
    await this.sweepStaleRuns(actor);
    const parsed = StartWorkflowInput.safeParse(raw);
    if (!parsed.success) {
      throw new HttpError(400, "invalid_input", "Invalid workflow input.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    const { kind, requestNonce, ...refs } = parsed.data;
    const tdb = tenantDb(actor, this.deps.db);
    await this.resolve(tdb, refs);

    const key = await idempotencyKey({
      tenantId: actor.tenantId,
      kind,
      ...refs,
      promptVersions: PROMPT_VERSIONS,
      ...(requestNonce ? { requestNonce } : {}),
    });
    const existing = await tdb.workflowRuns.findByKey(key);
    if (existing) return { run: summary(existing), created: false };

    const mode = this.deps.provider().mode;
    try {
      return await withTenantTx(actor, this.deps.db, async (t) => {
        await t.workflowRuns.lockTenant();
        const again = await t.workflowRuns.findByKey(key);
        if (again) return { run: summary(again), created: false };
        assertConcurrencyAvailable(await t.workflowRuns.countActive());
        const run = await t.workflowRuns.create({
          kind,
          idempotencyKey: key,
          generationMode: mode,
          promptVersions: PROMPT_VERSIONS,
          inputRefs: refs,
        });
        await t.audit.record({ actorId: actor.userId, action: "workflow.created", entityType: "WorkflowRun", entityId: run.id, metadata: { kind } });
        await t.workflowRuns.transition(run.id, "created", "queued", actor.userId);
        return { run: summary(await t.workflowRuns.getById(run.id)), created: true };
      });
    } catch (e) {
      // Lost a race on @@unique([tenantId, idempotencyKey]): return the winner.
      if (isUniqueViolation(e)) {
        const winner = await tdb.workflowRuns.findByKey(key);
        if (winner) return { run: summary(winner), created: false };
      }
      throw e;
    }
  }

  async execute(actor: Actor, runId: string): Promise<RunSummary> {
    const tdb = tenantDb(actor, this.deps.db);
    const run = await tdb.workflowRuns.getById(runId);
    if (run.status !== "queued") throw new HttpError(409, "conflict", `Run is ${run.status}, not queued.`);

    const attempts = run.attempts + 1;
    if (attempts > WORKFLOW_LIMITS.maxAttempts) {
      await tdb.workflowRuns.transition(runId, "queued", "failed", actor.userId, {
        error: sanitizeError(new HttpError(409, "max_attempts", `Run has used all ${WORKFLOW_LIMITS.maxAttempts} attempts.`)),
      });
      return summary(await tdb.workflowRuns.getById(runId));
    }

    let status: WorkflowStatus = "queued";
    const progress = newProgress();
    try {
      const provider = this.deps.provider();
      await tdb.workflowRuns.transition(runId, "queued", "running", actor.userId, {
        startedAt: this.now(),
        completedAt: null,
        attempts,
        error: null,
        generationMode: provider.mode,
        modelId: provider.modelId,
      }, { attempt: attempts });
      status = "running";

      const budget = new CostBudget(costCapUsd(this.deps.env ?? process.env), provider);
      const refs = run.inputRefs as unknown as RunInputRefs;
      const { product, persona, trigger, competitors } = await this.resolve(tdb, refs);
      const [{ snapshot, sourceClassifications }, policy] = await Promise.all([
        tdb.knowledge.snapshot({ competitorIds: refs.competitorIds }),
        tdb.tenant.policy(),
      ]);
      await runPmmPipeline(
        {
          snapshot,
          sourceClassifications,
          policy,
          brief: {
            productName: product.name,
            market: refs.market,
            persona: `${persona.name} (${persona.role})`,
            notes: `Regulatory trigger: ${trigger.name} (${trigger.jurisdiction}): ${trigger.summary}\nCompetitors: ${competitors.map((c) => c.name).join(", ")}`,
          },
        },
        provider,
        budget,
        progress,
        () => tdb.workflowRuns.touch(runId),
      );

      await tdb.workflowRuns.transition(runId, "running", "validation", null, this.metrics(progress), {
        messagingFrameworkPassedToC: progress.messagingFrameworkPassedToC,
      });
      status = "validation";

      // Gates + persistence for all outputs in ONE transaction: either the three
      // deliverables are in pending_review and the internal input brief is stored,
      // or nothing is (a retry cannot duplicate them).
      const now = this.now();
      await withTenantTx(actor, this.deps.db, async (t) => {
        for (const r of progress.results) {
          const prefix = r.llm.mode === "simulated" ? "[SIMULATED] " : "";
          const internal = isInternalAssetType(r.assetType);
          const label = internal ? INPUT_BRIEF_LABEL : ASSET_LABEL[r.assetType];
          const title = `${prefix}${label} — ${product.name} (${persona.name}, ${refs.market})`;
          const { id: assetId } = await t.assets.create({ type: r.assetType, title });
          let rec: AssetRecord = { id: assetId, tenantId: actor.tenantId, type: r.assetType, title, state: "draft", currentVersionId: null, versions: [], approvals: [] };
          rec = addVersion(rec, r.output, systemActor(actor.tenantId), snapshot, { id: randomUUID(), generationMode: r.llm.mode, now });
          const v = currentVersion(rec)!;
          await t.assets.insertVersion(v, runId);
          // The internal input brief never enters review; it stays a stored draft.
          if (!internal) rec = submitForReview(rec, systemActor(actor.tenantId));
          await t.assets.setState(assetId, ["draft"], rec.state, v.id);
          await t.audit.record({
            actorId: null,
            action: "asset.version_created",
            entityType: "Asset",
            entityId: assetId,
            metadata: {
              runId,
              versionId: v.id,
              versionNumber: v.versionNumber,
              assetType: r.assetType,
              gatesPassed: v.gatesPassed,
              criticalFindings: v.gateReport.findings.filter((f) => f.severity === "critical").length,
              requiresExpertReview: v.gateReport.requiresExpertReview,
              promptId: r.prompt.id,
              promptVersion: r.prompt.version,
              internal,
            },
          });
          if (!internal) {
            await t.audit.record({ actorId: null, action: "asset.pending_review", entityType: "Asset", entityId: assetId, metadata: { from: "draft", to: rec.state, versionId: v.id } });
          }
        }
        await t.workflowRuns.transition(runId, "validation", "pending_review", null, {}, { deliverables: progress.results.filter((r) => !isInternalAssetType(r.assetType)).length });
      });
      status = "pending_review";

      // "completed" = the run is done and its outputs are in human review. NOT approved.
      await tdb.workflowRuns.transition(runId, "pending_review", "completed", null, { completedAt: this.now() });
    } catch (e) {
      if (status === "queued") throw e; // never started; nothing to record
      log.error("workflow run failed", { runId, error: e });
      try {
        await tdb.workflowRuns.transition(runId, status, "failed", null, {
          ...this.metrics(progress),
          error: sanitizeError(e),
          completedAt: this.now(),
        });
      } catch (inner) {
        log.error("could not mark workflow run failed", { runId, error: inner });
      }
    }
    return summary(await tdb.workflowRuns.getById(runId));
  }

  private metrics(p: ReturnType<typeof newProgress>) {
    return {
      usage: { ...p.usage, llmRequests: p.llmRequests },
      costEstimateUsd: p.costUsd,
      ...(p.modelId ? { modelId: p.modelId } : {}),
      ...(Object.keys(p.promptVersions).length ? { promptVersions: p.promptVersions } : {}),
    };
  }

  async retry(actor: Actor, runId: string): Promise<RunSummary> {
    requireEditor(actor);
    await this.sweepStaleRuns(actor);
    return withTenantTx(actor, this.deps.db, async (t) => {
      await t.workflowRuns.lockTenant();
      const run = await t.workflowRuns.getById(runId);
      assertCanRetry(run);
      assertConcurrencyAvailable(await t.workflowRuns.countActive());
      await t.workflowRuns.transition(runId, "failed", "queued", actor.userId, { error: null }, { retry: true });
      return summary(await t.workflowRuns.getById(runId));
    });
  }

  /**
   * Stale-run sweep: active runs with no progress for STALE_RUN_AFTER_MS are
   * marked failed with a sanitized error. Runs on every workflow request of the
   * tenant; executing runs send a heartbeat after each agent step.
   */
  async sweepStaleRuns(actor: Actor): Promise<number> {
    const tdb = tenantDb(actor, this.deps.db);
    const now = this.now();
    const stale = await tdb.workflowRuns.listStale(new Date(now.getTime() - STALE_RUN_AFTER_MS));
    let swept = 0;
    for (const r of stale) {
      try {
        await tdb.workflowRuns.transition(r.id, r.status, "failed", null, { error: STALE_AUTO_ERROR, completedAt: now }, { stale: true, automatic: true });
        swept++;
      } catch (e) {
        if (!(e instanceof HttpError)) throw e; // ConflictError: the run moved on meanwhile
      }
    }
    return swept;
  }

  async markStaleRunFailed(actor: Actor, runId: string): Promise<RunSummary> {
    if (!hasRole(actor, "admin")) throw new HttpError(403, "forbidden", "Admin role required.");
    return withTenantTx(actor, this.deps.db, async (t) => {
      await t.workflowRuns.lockTenant();
      const run = await t.workflowRuns.getById(runId);
      if (!ACTIVE_RUN_STATUSES.includes(run.status)) throw new HttpError(409, "not_active", `Run is ${run.status}.`);
      if (!isStale(run, this.now())) {
        throw new HttpError(409, "not_stale", `Run has changed within the last ${STALE_RUN_AFTER_MS / 60_000} minutes.`);
      }
      await t.workflowRuns.transition(
        runId,
        run.status,
        "failed",
        actor.userId,
        { error: "stale: Marked as failed by an administrator (no progress).", completedAt: this.now() },
        { stale: true },
      );
      return summary(await t.workflowRuns.getById(runId));
    });
  }

  async get(actor: Actor, runId: string): Promise<RunDetails> {
    await this.sweepStaleRuns(actor);
    const tdb = tenantDb(actor, this.deps.db);
    const run = await tdb.workflowRuns.getById(runId);
    const [history, outputs] = await Promise.all([tdb.audit.listFor("WorkflowRun", runId), tdb.workflowRuns.outputs(runId)]);
    return {
      run: summary(run),
      history: history.map((h) => ({ action: h.action, at: h.createdAt, metadata: h.metadata })),
      outputs: outputs.map((o) => ({
        assetId: o.assetId,
        versionId: o.id,
        assetType: o.asset.type,
        assetState: o.asset.state,
        title: o.asset.title,
        gatesPassed: o.gatesPassed,
        internal: isInternalAssetType(o.asset.type),
      })),
    };
  }
}

export { PMM_THREE_ASSET };
