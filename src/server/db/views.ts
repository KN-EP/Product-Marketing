import type { DbTx } from "./tenant-scope";
import { NotFoundError } from "../errors";

/**
 * Read-only queries for the UI pages. Only reachable through tenantDb(actor).views,
 * which supplies the actor's tenantId; every query and every nested relation
 * below filters on it. By-id lookups use findFirst({ where: { id, tenantId } }).
 */
export function tenantViews(tenantId: string, db: DbTx) {
  const orNotFound = <T>(row: T | null, entity: string): T => {
    if (row === null) throw new NotFoundError(entity);
    return row;
  };

  return {
    products: () =>
      db.product.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          area: true,
          description: true,
          isSynthetic: true,
          _count: { select: { features: { where: { tenantId } }, claims: { where: { tenantId } } } },
        },
      }),

    product: async (id: string) =>
      orNotFound(
        await db.product.findFirst({
          where: { id, tenantId },
          select: {
            id: true,
            name: true,
            area: true,
            description: true,
            isSynthetic: true,
            version: true,
            features: { where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, isSynthetic: true } },
            claims: {
              where: { tenantId },
              orderBy: { createdAt: "asc" },
              select: { id: true, text: true, category: true, state: true, _count: { select: { evidence: { where: { tenantId } } } } },
            },
          },
        }),
        "product",
      ),

    sources: () =>
      db.source.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          kind: true,
          url: true,
          publisher: true,
          classification: true,
          status: true,
          content: true,
          isSynthetic: true,
          retrievedAt: true,
          _count: { select: { claimEvidence: { where: { tenantId } } } },
        },
      }),

    claims: () =>
      db.claim.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          text: true,
          category: true,
          state: true,
          isSynthetic: true,
          approvedAt: true,
          lastVerifiedAt: true,
          staleReason: true,
          product: { select: { id: true, name: true } },
          evidence: {
            where: { tenantId },
            select: { id: true, excerpt: true, locator: true, source: { select: { id: true, title: true, status: true } } },
          },
        },
      }),

    personas: () =>
      db.persona.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          market: true,
          goals: true,
          concerns: true,
          isSynthetic: true,
          buyerProblems: { where: { tenantId }, select: { id: true, statement: true, severity: true } },
        },
      }),

    competitors: () =>
      db.competitor.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          website: true,
          isPlaceholder: true,
          evidence: {
            where: { tenantId },
            select: { id: true, assertion: true, excerpt: true, state: true, source: { select: { id: true, title: true } } },
          },
        },
      }),

    regulatoryTriggers: () =>
      db.regulatoryTrigger.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, jurisdiction: true, summary: true },
      }),

    assets: () =>
      db.asset.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          type: true,
          state: true,
          updatedAt: true,
          currentVersionId: true,
          versions: {
            where: { tenantId },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true, gatesPassed: true, generationMode: true },
          },
        },
      }),

    /** workflowRunId per version (not part of the domain AssetVersionRecord). */
    versionRuns: async (assetId: string) =>
      new Map(
        (
          await db.assetVersion.findMany({
            where: { tenantId, assetId },
            select: { id: true, workflowRunId: true },
          })
        ).map((v) => [v.id, v.workflowRunId] as const),
      ),

    reviewQueue: () =>
      db.asset.findMany({
        where: { tenantId, state: "pending_review" },
        orderBy: { updatedAt: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          updatedAt: true,
          versions: {
            where: { tenantId },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true, gatesPassed: true, gateReport: true, generationMode: true },
          },
        },
      }),

    recentDecisions: (take = 20) =>
      db.approval.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          decision: true,
          createdAt: true,
          reviewer: { select: { name: true } },
          assetVersion: { select: { versionNumber: true, asset: { select: { id: true, title: true } } } },
        },
      }),

    runs: (take = 50) =>
      db.workflowRun.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          kind: true,
          status: true,
          generationMode: true,
          attempts: true,
          costEstimateUsd: true,
          createdAt: true,
          completedAt: true,
          error: true,
        },
      }),

    members: () =>
      db.membership.findMany({
        where: { tenantId },
        orderBy: { role: "asc" },
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
      }),

    tenantSettings: async () =>
      orNotFound(
        await db.tenant.findFirst({
          where: { id: tenantId },
          select: { id: true, name: true, slug: true, isDemo: true, externalModelsApproved: true, maxExternalModelClass: true },
        }),
        "tenant",
      ),

    /** Counters for the guided demo checklist. */
    demoProgress: async () => {
      const [runsCompleted, assetsPending, assetsApproved, humanEdits, exports, claimsApproved] = await Promise.all([
        db.workflowRun.count({ where: { tenantId, status: "completed" } }),
        db.asset.count({ where: { tenantId, state: "pending_review" } }),
        db.asset.count({ where: { tenantId, state: "approved" } }),
        db.assetVersion.count({ where: { tenantId, generationMode: "human_edit" } }),
        db.auditEvent.count({ where: { tenantId, action: "asset.exported" } }),
        db.claim.count({ where: { tenantId, state: "approved" } }),
      ]);
      return { runsCompleted, assetsPending, assetsApproved, humanEdits, exports, claimsApproved };
    },
  };
}
