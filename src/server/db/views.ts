import type { DbTx } from "./tenant-scope";
import { NotFoundError } from "../errors";
import { INTERNAL_ASSET_TYPES } from "../assets/deliverables";

/** Deliverables only: the internal input brief is never listed, queued or counted. */
const DELIVERABLE = { type: { notIn: [...INTERNAL_ASSET_TYPES] } };

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
            features: {
              where: { tenantId },
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                description: true,
                isSynthetic: true,
                claims: { where: { tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, text: true, state: true } },
              },
            },
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

    campaigns: () =>
      db.campaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          market: true,
          startsOn: true,
          endsOn: true,
          isSynthetic: true,
          product: { select: { name: true } },
          persona: { select: { name: true, role: true } },
          assets: { where: { tenantId }, select: { state: true } },
          _count: { select: { workflowRuns: { where: { tenantId } } } },
        },
      }),

    /** Campaign briefing + its runs and deliverables (all filtered on the tenant). */
    campaign: async (id: string) =>
      orNotFound(
        await db.campaign.findFirst({
          where: { id, tenantId },
          select: {
            id: true,
            name: true,
            type: true,
            objective: true,
            market: true,
            channels: true,
            startsOn: true,
            endsOn: true,
            budgetEur: true,
            isSynthetic: true,
            createdAt: true,
            product: { select: { id: true, name: true } },
            persona: { select: { id: true, name: true, role: true } },
            workflowRuns: {
              where: { tenantId },
              orderBy: { createdAt: "desc" },
              select: { id: true, status: true, generationMode: true, createdAt: true, completedAt: true, error: true },
            },
            assets: {
              where: { tenantId },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                title: true,
                type: true,
                state: true,
                updatedAt: true,
                versions: {
                  where: { tenantId },
                  orderBy: { versionNumber: "desc" },
                  take: 1,
                  select: { id: true, versionNumber: true, gatesPassed: true, generationMode: true },
                },
              },
            },
          },
        }),
        "campaign",
      ),

    regulatoryTriggers: () =>
      db.regulatoryTrigger.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, jurisdiction: true, summary: true },
      }),

    assets: () =>
      db.asset.findMany({
        where: { tenantId, ...DELIVERABLE },
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
        where: { tenantId, state: "pending_review", ...DELIVERABLE },
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
          campaign: { select: { id: true, name: true } },
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

    /** Latest Agent A input brief generated for a product (internal; shown on the product page). */
    inputBriefForProduct: async (productId: string) => {
      const runs = await db.workflowRun.findMany({
        where: { tenantId, inputRefs: { path: ["productId"], equals: productId } },
        select: { id: true },
      });
      if (runs.length === 0) return null;
      return db.assetVersion.findFirst({
        where: { tenantId, workflowRunId: { in: runs.map((r) => r.id) }, asset: { type: { in: [...INTERNAL_ASSET_TYPES] } } },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true, gateReport: true, generationMode: true, createdAt: true, workflowRunId: true, asset: { select: { id: true } } },
      });
    },

    /** Counters for the guided demo checklist. */
    demoProgress: async () => {
      const [runsCompleted, assetsPending, assetsApproved, humanEdits, exports, claimsApproved, campaigns, campaignRunsCompleted, campaignAssetsApproved] = await Promise.all([
        db.workflowRun.count({ where: { tenantId, status: "completed", kind: "pmm_three_asset" } }),
        db.asset.count({ where: { tenantId, state: "pending_review", ...DELIVERABLE } }),
        db.asset.count({ where: { tenantId, state: "approved", ...DELIVERABLE } }),
        db.assetVersion.count({ where: { tenantId, generationMode: "human_edit" } }),
        db.auditEvent.count({ where: { tenantId, action: "asset.exported" } }),
        db.claim.count({ where: { tenantId, state: "approved" } }),
        db.campaign.count({ where: { tenantId } }),
        db.workflowRun.count({ where: { tenantId, status: "completed", kind: "campaign_gtm" } }),
        db.asset.count({ where: { tenantId, state: "approved", campaignId: { not: null } } }),
      ]);
      return { runsCompleted, assetsPending, assetsApproved, humanEdits, exports, claimsApproved, campaigns, campaignRunsCompleted, campaignAssetsApproved };
    },
  };
}
