import type { Actor } from "../../domain/actor";
import type { ApprovalRecord, AssetRecord, AssetState, AssetVersionRecord } from "../../domain/assets/asset-state";
import type { ClaimRecord, ClaimState, CompetitorEvidenceRecord, KnowledgeSnapshot, SourceRecord } from "../../domain/knowledge/snapshot";
import { buildSnapshot } from "../../domain/knowledge/snapshot";
import type { GateReport } from "../../domain/quality-gates/gates";
import type { AssetType } from "../../domain/schemas/agents";
import { assertWorkflowTransition, type WorkflowStatus } from "../../domain/workflow/workflow-state";
import type { Prisma } from "../../generated/prisma/client";
import type { DataClassification, ExternalModelPolicy } from "../llm/classification";
import { ConflictError, NotFoundError } from "../errors";
import type { Db } from "./client";
import { tenantViews } from "./views";
import { INTERNAL_ASSET_TYPES } from "../assets/deliverables";

/** A client or an interactive-transaction client. */
export type DbTx = Prisma.TransactionClient;

function orNotFound<T>(row: T | null, entity: string): T {
  if (row === null) throw new NotFoundError(entity);
  return row;
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/** Runs that occupy a concurrency slot. */
export const ACTIVE_RUN_STATUSES: WorkflowStatus[] = ["created", "queued", "running", "validation", "pending_review"];

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  /** Sanitized: ids, states, counts. Never content, prompts, comments or credentials. */
  metadata?: Record<string, unknown>;
}

/**
 * Tenant-scoped data-access layer. The tenant comes from the resolved Actor
 * only; every query below filters on it, including nested relations. Lookups
 * by id use findFirst({ where: { id, tenantId } }) and throw NotFoundError on
 * a miss — identical for "missing" and "belongs to another tenant".
 */
export function tenantDb(actor: Actor, db: DbTx) {
  const tenantId = actor.tenantId;
  if (!tenantId) throw new Error("tenantDb requires an actor with a tenantId");

  const audit = {
    record: (e: AuditInput) =>
      db.auditEvent.create({
        data: {
          tenantId,
          actorId: e.actorId,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          ...(e.metadata ? { metadata: json(e.metadata) } : {}),
        },
      }),
    listFor: (entityType: string, entityId: string) =>
      db.auditEvent.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { action: true, actorId: true, metadata: true, createdAt: true },
      }),
  };

  return {
    tenantId,
    audit,
    /** Read-only page queries (src/server/db/views.ts), scoped to this tenant. */
    views: tenantViews(tenantId, db),

    tenant: {
      get: async () =>
        orNotFound(
          await db.tenant.findFirst({
            where: { id: tenantId },
            select: { id: true, slug: true, name: true, isDemo: true },
          }),
          "tenant",
        ),
      policy: async (): Promise<ExternalModelPolicy> => {
        const t = orNotFound(
          await db.tenant.findFirst({
            where: { id: tenantId },
            select: { externalModelsApproved: true, maxExternalModelClass: true },
          }),
          "tenant",
        );
        return { tenantId, ...t };
      },
    },

    /** Display names of users who are members of THIS tenant only. */
    memberNames: async (userIds: string[]): Promise<Map<string, string>> => {
      const rows = await db.membership.findMany({
        where: { tenantId, userId: { in: userIds } },
        select: { user: { select: { id: true, name: true } } },
      });
      return new Map(rows.map((r) => [r.user.id, r.user.name]));
    },

    counts: async () => {
      const [assets, claims, sources] = await Promise.all([
        // Deliverables only — the internal input brief is not an asset for the user.
        db.asset.count({ where: { tenantId, type: { notIn: [...INTERNAL_ASSET_TYPES] } } }),
        db.claim.count({ where: { tenantId } }),
        db.source.count({ where: { tenantId } }),
      ]);
      return { assets, claims, sources };
    },

    products: {
      getById: async (id: string) =>
        orNotFound(await db.product.findFirst({ where: { id, tenantId }, select: { id: true, name: true, area: true } }), "product"),
    },
    personas: {
      getById: async (id: string) =>
        orNotFound(
          await db.persona.findFirst({ where: { id, tenantId }, select: { id: true, name: true, role: true, market: true } }),
          "persona",
        ),
    },
    regulatoryTriggers: {
      getById: async (id: string) =>
        orNotFound(
          await db.regulatoryTrigger.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true, jurisdiction: true, summary: true },
          }),
          "regulatory trigger",
        ),
    },
    competitors: {
      getById: async (id: string) =>
        orNotFound(await db.competitor.findFirst({ where: { id, tenantId }, select: { id: true, name: true } }), "competitor"),
    },

    knowledge: {
      /**
       * Tenant-scoped read model for gates and agents, plus the classifications
       * of the sources it contains (input to the external-model gate).
       */
      snapshot: async (opts: { competitorIds?: string[] } = {}): Promise<{
        snapshot: KnowledgeSnapshot;
        sourceClassifications: DataClassification[];
      }> => {
        const [sources, claims, evidence] = await Promise.all([
          db.source.findMany({ where: { tenantId } }),
          db.claim.findMany({ where: { tenantId }, include: { evidence: { where: { tenantId } } } }),
          db.competitorEvidence.findMany({
            where: { tenantId, ...(opts.competitorIds ? { competitorId: { in: opts.competitorIds } } : {}) },
          }),
        ]);
        const sourceRecords: SourceRecord[] = sources.map((s) => ({
          id: s.id,
          tenantId: s.tenantId,
          title: s.title,
          url: s.url,
          status: s.status,
          content: s.content,
          isSynthetic: s.isSynthetic,
        }));
        const claimRecords: ClaimRecord[] = claims.map(toClaimRecord);
        const evidenceRecords: CompetitorEvidenceRecord[] = evidence.map((e) => ({
          id: e.id,
          tenantId: e.tenantId,
          competitorId: e.competitorId,
          sourceId: e.sourceId,
          assertion: e.assertion,
          excerpt: e.excerpt,
          state: e.state,
        }));
        return {
          snapshot: buildSnapshot({ tenantId, sources: sourceRecords, claims: claimRecords, competitorEvidence: evidenceRecords }),
          sourceClassifications: sources.filter((s) => s.status === "active").map((s) => s.classification),
        };
      },
    },

    assets: {
      list: () =>
        db.asset.findMany({
          where: { tenantId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, type: true, state: true, updatedAt: true },
        }),
      getById: async (id: string) =>
        orNotFound(
          await db.asset.findFirst({
            where: { id, tenantId },
            include: { versions: { where: { tenantId }, orderBy: { versionNumber: "desc" } } },
          }),
          "asset",
        ),
      /** The asset as a domain AssetRecord (versions + approvals). */
      getRecord: async (id: string): Promise<AssetRecord> => {
        const a = orNotFound(
          await db.asset.findFirst({
            where: { id, tenantId },
            include: {
              versions: {
                where: { tenantId },
                orderBy: { versionNumber: "asc" },
                include: { approvals: { where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
              },
            },
          }),
          "asset",
        );
        const versions: AssetVersionRecord[] = a.versions.map((v) => ({
          id: v.id,
          tenantId: v.tenantId,
          assetId: v.assetId,
          versionNumber: v.versionNumber,
          schemaVersion: v.schemaVersion,
          content: v.content,
          gateReport: v.gateReport as unknown as GateReport,
          gatesPassed: v.gatesPassed,
          generationMode: v.generationMode,
          basedOnVersionId: v.basedOnVersionId,
          createdAt: v.createdAt,
        }));
        const approvals: ApprovalRecord[] = a.versions
          .flatMap((v) => v.approvals)
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
          .map((p) => ({
            assetVersionId: p.assetVersionId,
            reviewerId: p.reviewerId,
            decision: p.decision,
            comment: p.comment,
            createdAt: p.createdAt,
          }));
        return {
          id: a.id,
          tenantId: a.tenantId,
          type: a.type as AssetType,
          title: a.title,
          state: a.state,
          currentVersionId: a.currentVersionId,
          versions,
          approvals,
        };
      },
      create: (data: { type: AssetType; title: string }) =>
        db.asset.create({ data: { tenantId, type: data.type, title: data.title, state: "draft" }, select: { id: true } }),
      /** AssetVersion rows are insert-only: there is no update path. */
      insertVersion: (v: AssetVersionRecord, workflowRunId: string | null = null) => {
        if (v.tenantId !== tenantId) throw new NotFoundError("asset");
        return db.assetVersion.create({
          data: {
            id: v.id,
            tenantId,
            assetId: v.assetId,
            versionNumber: v.versionNumber,
            schemaVersion: v.schemaVersion,
            content: json(v.content),
            gateReport: json(v.gateReport),
            gatesPassed: v.gatesPassed,
            generationMode: v.generationMode,
            workflowRunId,
            basedOnVersionId: v.basedOnVersionId ?? null,
            createdAt: v.createdAt,
          },
          select: { id: true },
        });
      },
      /** Optimistic state change: fails with 409 if the asset is no longer in an expected state. */
      setState: async (id: string, from: AssetState[], to: AssetState, currentVersionId?: string) => {
        const r = await db.asset.updateMany({
          where: { id, tenantId, state: { in: from } },
          data: { state: to, ...(currentVersionId ? { currentVersionId } : {}) },
        });
        if (r.count !== 1) throw new ConflictError("Asset changed concurrently; reload and try again.");
      },
      insertApproval: (p: ApprovalRecord) =>
        db.approval.create({
          data: {
            tenantId,
            assetVersionId: p.assetVersionId,
            reviewerId: p.reviewerId,
            decision: p.decision,
            comment: p.comment,
            createdAt: p.createdAt,
          },
          select: { id: true },
        }),
    },

    claims: {
      list: () =>
        db.claim.findMany({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          select: { id: true, text: true, category: true, state: true, isSynthetic: true },
        }),
      getById: async (id: string) =>
        orNotFound(
          await db.claim.findFirst({
            where: { id, tenantId },
            include: { evidence: { where: { tenantId } } },
          }),
          "claim",
        ),
      getRecord: async (id: string): Promise<ClaimRecord> =>
        toClaimRecord(
          orNotFound(
            await db.claim.findFirst({ where: { id, tenantId }, include: { evidence: { where: { tenantId } } } }),
            "claim",
          ),
        ),
      /** Optimistic claim state change (from → to). */
      setState: async (
        id: string,
        from: ClaimState,
        to: ClaimState,
        extra: { reviewerId?: string; approvedAt?: Date; lastVerifiedAt?: Date; staleReason?: string | null } = {},
      ) => {
        const r = await db.claim.updateMany({ where: { id, tenantId, state: from }, data: { state: to, ...extra } });
        if (r.count !== 1) throw new ConflictError("Claim changed concurrently; reload and try again.");
      },
    },

    sources: {
      list: () =>
        db.source.findMany({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, kind: true, status: true, isSynthetic: true },
        }),
      getById: async (id: string) =>
        orNotFound(await db.source.findFirst({ where: { id, tenantId } }), "source"),
    },

    workflowRuns: {
      getById: async (id: string) => orNotFound(await db.workflowRun.findFirst({ where: { id, tenantId } }), "workflow run"),
      findByKey: (idempotencyKey: string) => db.workflowRun.findFirst({ where: { tenantId, idempotencyKey } }),
      countActive: () => db.workflowRun.count({ where: { tenantId, status: { in: ACTIVE_RUN_STATUSES } } }),
      /** Active runs whose row has not changed since `before`. */
      listStale: (before: Date) =>
        db.workflowRun.findMany({
          where: { tenantId, status: { in: ACTIVE_RUN_STATUSES }, updatedAt: { lt: before } },
          select: { id: true, status: true },
        }),
      /** Heartbeat while a run is executing (keeps it from being swept as stale). */
      touch: (id: string) => db.workflowRun.updateMany({ where: { id, tenantId, status: "running" }, data: { updatedAt: new Date() } }),
      /**
       * Serialises run admission per tenant (inside a transaction): the
       * concurrency check and the insert cannot interleave.
       */
      lockTenant: () => db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pmm_workflow:${tenantId}`}))`,
      create: (data: {
        kind: string;
        idempotencyKey: string;
        generationMode: "live" | "simulated";
        promptVersions: Record<string, string>;
        inputRefs: Record<string, unknown>;
      }) =>
        db.workflowRun.create({
          data: {
            tenantId,
            kind: data.kind,
            status: "created",
            idempotencyKey: data.idempotencyKey,
            generationMode: data.generationMode,
            promptVersions: json(data.promptVersions),
            inputRefs: json(data.inputRefs),
          },
        }),
      /**
       * Status change validated by the domain transition table, applied only
       * if the run is still in `from` (optimistic), and audited.
       */
      transition: async (
        id: string,
        from: WorkflowStatus,
        to: WorkflowStatus,
        actorId: string | null,
        patch: Omit<Prisma.WorkflowRunUpdateManyMutationInput, "status"> = {},
        meta: Record<string, unknown> = {},
      ) => {
        assertWorkflowTransition(from, to);
        const r = await db.workflowRun.updateMany({ where: { id, tenantId, status: from }, data: { ...patch, status: to } });
        if (r.count !== 1) throw new ConflictError("Workflow run changed concurrently.");
        await audit.record({ actorId, action: `workflow.${to}`, entityType: "WorkflowRun", entityId: id, metadata: { from, to, ...meta } });
      },
      /** Asset versions produced by a run. */
      outputs: (runId: string) =>
        db.assetVersion.findMany({
          where: { tenantId, workflowRunId: runId },
          orderBy: { createdAt: "asc" },
          select: { id: true, assetId: true, versionNumber: true, gatesPassed: true, asset: { select: { type: true, state: true, title: true } } },
        }),
    },
  };
}

function toClaimRecord(c: {
  id: string;
  tenantId: string;
  text: string;
  category: ClaimRecord["category"];
  state: ClaimState;
  isSynthetic: boolean;
  evidence: { sourceId: string; excerpt: string; locator: string | null }[];
}): ClaimRecord {
  return {
    id: c.id,
    tenantId: c.tenantId,
    text: c.text,
    category: c.category,
    state: c.state,
    isSynthetic: c.isSynthetic,
    evidence: c.evidence.map((e) => ({ sourceId: e.sourceId, excerpt: e.excerpt, locator: e.locator })),
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;

/** Runs fn inside one interactive transaction with a tenant-scoped DAL. */
export function withTenantTx<T>(actor: Actor, db: Db, fn: (tdb: TenantDb) => Promise<T>): Promise<T> {
  return db.$transaction((tx) => fn(tenantDb(actor, tx)), { timeout: 30_000, maxWait: 10_000 });
}
