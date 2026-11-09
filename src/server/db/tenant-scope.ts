import type { Actor } from "../../domain/actor";
import type { ApprovalRecord, AssetRecord, AssetState, AssetVersionRecord } from "../../domain/assets/asset-state";
import type { ClaimRecord, ClaimState, CompetitorEvidenceRecord, KnowledgeSnapshot, SourceRecord } from "../../domain/knowledge/snapshot";
import { buildSnapshot } from "../../domain/knowledge/snapshot";
import type { GateReport } from "../../domain/quality-gates/gates";
import type { AssetType } from "../../domain/schemas/agents";
import type { CampaignType } from "../../domain/schemas/campaign";
import type { ReleaseType } from "../../domain/schemas/release";
import type { ReadinessFacts } from "../../domain/launches/launch";
import type { LaunchPhase, LaunchTier } from "../../domain/schemas/launch";
import { SALES_TOOLKIT_TYPES } from "../../domain/schemas/enablement";
import type { KpiPatch, KpiSeed } from "../../domain/kpis/kpi";
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

  // M16: open radar alerts for a product (launch readiness); bound to api.radar below.
  let radarOpenAlerts: (productId: string) => Promise<number> = async () => 0;

  const api = {
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
      /** M12: the tenant's buyer roles, as context for the use case agent. */
      list: () => db.persona.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
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
    campaigns: {
      /** The briefing a campaign_gtm run works from. Product and persona share the tenant (composite FKs). */
      getById: async (id: string) => {
        const c = orNotFound(
          await db.campaign.findFirst({
            where: { id, tenantId },
            select: {
              id: true,
              name: true,
              type: true,
              objective: true,
              market: true,
              communicationChannels: true,
              salesChannels: true,
              startsOn: true,
              endsOn: true,
              budgetEur: true,
              isSynthetic: true,
              product: { select: { id: true, name: true } },
              persona: { select: { id: true, name: true, role: true } },
            },
          }),
          "campaign",
        );
        return { ...c, budgetEur: c.budgetEur === null ? null : c.budgetEur.toNumber() };
      },
      /** Product and persona must already be resolved through this DAL (404 on a foreign id). */
      create: (data: {
        name: string;
        type: CampaignType;
        objective: string;
        productId: string;
        personaId: string;
        market: string;
        communicationChannels: string[];
        salesChannels: string[];
        startsOn: Date | null;
        endsOn: Date | null;
        budgetEur: number | null;
        isSynthetic?: boolean;
      }) => db.campaign.create({ data: { ...data, tenantId }, select: { id: true } }),
    },
    releases: {
      /** M12: the release briefing a release_communication run works from. The product shares the tenant (composite FK). */
      getById: async (id: string) =>
        orNotFound(
          await db.release.findFirst({
            where: { id, tenantId },
            select: {
              id: true,
              name: true,
              version: true,
              type: true,
              plannedOn: true,
              summary: true,
              changes: true,
              audiences: true,
              communicationChannels: true,
              salesChannels: true,
              isSynthetic: true,
              product: { select: { id: true, name: true } },
            },
          }),
          "release",
        ),
      /** The product must already be resolved through this DAL (404 on a foreign id). */
      create: (data: {
        productId: string;
        name: string;
        version: string;
        type: ReleaseType;
        plannedOn: Date | null;
        summary: string;
        changes: string[];
        audiences: string[];
        communicationChannels: string[];
        salesChannels: string[];
        isSynthetic?: boolean;
      }) => db.release.create({ data: { ...data, tenantId }, select: { id: true } }),
    },

    /** M16: regulatory radar — watched items, recorded changes, open alerts. */
    radar: {
      getWatch: async (id: string) =>
        orNotFound(
          await db.regulatoryWatch.findFirst({
            where: { id, tenantId },
            select: {
              id: true,
              name: true,
              jurisdiction: true,
              topic: true,
              currentDeadline: true,
              source: { select: { id: true, content: true, contentHash: true, status: true } },
            },
          }),
          "regulatory watch",
        ),
      getChange: async (id: string) =>
        orNotFound(
          await db.regulatoryChange.findFirst({
            where: { id, tenantId },
            select: {
              id: true,
              kind: true,
              summary: true,
              previousDeadline: true,
              newDeadline: true,
              impact: true,
              resolvedAt: true,
              createdAt: true,
              watch: { select: { id: true, name: true, jurisdiction: true, topic: true, sourceId: true } },
            },
          }),
          "regulatory change",
        ),
      /** The new wording replaces the stored text (version + 1); the source stays active. */
      updateSource: async (sourceId: string, content: string, contentHash: string, at: Date) => {
        const r = await db.source.updateMany({ where: { id: sourceId, tenantId }, data: { content, contentHash, retrievedAt: at, status: "active", version: { increment: 1 } } });
        if (r.count !== 1) throw new NotFoundError("source");
      },
      setDeadline: (watchId: string, deadline: Date | null) => db.regulatoryWatch.updateMany({ where: { id: watchId, tenantId }, data: { currentDeadline: deadline } }),
      createChange: (data: {
        watchId: string;
        kind: "deadline_shift" | "scope_change" | "new_guidance" | "repeal" | "other";
        summary: string;
        previousDeadline: Date | null;
        newDeadline: Date | null;
        previousContentHash: string;
        newContentHash: string;
        impact: unknown;
        recordedById: string;
      }) => db.regulatoryChange.create({ data: { ...data, tenantId, impact: json(data.impact) }, select: { id: true } }),
      /** Optimistic: only an open change. */
      resolve: async (id: string, by: string, note: string, at: Date) => {
        const r = await db.regulatoryChange.updateMany({ where: { id, tenantId, resolvedAt: null }, data: { resolvedAt: at, resolvedById: by, resolutionNote: note } });
        if (r.count !== 1) throw new ConflictError("The change was already resolved.");
      },
      /** Open alerts whose impact touches one of the product's claims or deliverables. */
      openAlertsForProduct: async (productId: string): Promise<number> => {
        const open = await db.regulatoryChange.findMany({ where: { tenantId, resolvedAt: null }, select: { impact: true } });
        if (open.length === 0) return 0;
        const [claims, assets] = await Promise.all([
          db.claim.findMany({ where: { tenantId, productId }, select: { id: true } }),
          db.asset.findMany({
            where: {
              tenantId,
              OR: [
                { campaign: { tenantId, productId } },
                { launch: { tenantId, productId } },
                { release: { tenantId, productId } },
                { versions: { some: { tenantId, workflowRun: { tenantId, inputRefs: { path: ["productId"], equals: productId } } } } },
              ],
            },
            select: { id: true },
          }),
        ]);
        const claimIds = new Set(claims.map((c) => c.id));
        const assetIds = new Set(assets.map((a) => a.id));
        return open.filter((c) => {
          const i = c.impact as { staleClaimIds?: string[]; affectedAssets?: { assetId: string }[] };
          return (i.staleClaimIds ?? []).some((id) => claimIds.has(id)) || (i.affectedAssets ?? []).some((a) => assetIds.has(a.assetId));
        }).length;
      },
    },

    /** M15: staged launches, readiness facts and go / no-go decisions. */
    launches: {
      getById: async (id: string) =>
        orNotFound(
          await db.launch.findFirst({
            where: { id, tenantId },
            select: {
              id: true,
              name: true,
              tier: true,
              summary: true,
              pricingModel: true,
              targetSegments: true,
              earlyAccessOn: true,
              generalAvailabilityOn: true,
              customerLaunchOn: true,
              marketLaunchOn: true,
              externalReferences: true,
              internalPilot: true,
              updatedAt: true,
              product: { select: { id: true, name: true } },
              release: { select: { id: true, name: true, version: true } },
            },
          }),
          "launch",
        ),
      /** Product and release must already be resolved through this DAL (404 on a foreign id). */
      create: (data: {
        productId: string;
        releaseId: string | null;
        name: string;
        tier: LaunchTier;
        summary: string;
        pricingModel: string;
        targetSegments: string;
        earlyAccessOn: Date | null;
        generalAvailabilityOn: Date | null;
        customerLaunchOn: Date | null;
        marketLaunchOn: Date | null;
        externalReferences: number;
        internalPilot: boolean;
        isSynthetic?: boolean;
      }) => db.launch.create({ data: { ...data, tenantId }, select: { id: true } }),
      updateProof: async (id: string, data: { externalReferences: number; internalPilot: boolean }) => {
        const r = await db.launch.updateMany({ where: { id, tenantId }, data });
        if (r.count !== 1) throw new NotFoundError("launch");
      },
      /**
       * Everything readiness is computed from. "Approved" = a human approval exists
       * for a version of a matching deliverable (same rule as the agent context).
       */
      facts: async (launch: { id: string; productId: string; releaseId: string | null; externalReferences: number; internalPilot: boolean }, opts: { forPlan?: boolean } = {}): Promise<ReadinessFacts> => {
        const approvedFor = (type: AssetType) =>
          db.approval.count({
            where: {
              tenantId,
              decision: "approved",
              assetVersion: {
                tenantId,
                asset: { tenantId, type, versions: { some: { tenantId, workflowRun: { tenantId, inputRefs: { path: ["productId"], equals: launch.productId } } } } },
              },
            },
          });
        const [approvedClaims, staleClaims, messaging, battlecard, enablement, plan, releasePlan, winLoss] = await Promise.all([
          db.claim.count({ where: { tenantId, productId: launch.productId, state: "approved" } }),
          db.claim.count({ where: { tenantId, productId: launch.productId, state: "stale" } }),
          approvedFor("messaging_framework"),
          approvedFor("competitive_battlecard"),
          db.approval.count({
            where: {
              tenantId,
              decision: "approved",
              assetVersion: { tenantId, asset: { tenantId, type: { in: ["sales_play", ...SALES_TOOLKIT_TYPES] }, campaign: { tenantId, productId: launch.productId } } },
            },
          }),
          db.approval.count({ where: { tenantId, decision: "approved", assetVersion: { tenantId, asset: { tenantId, type: "launch_plan", launchId: launch.id } } } }),
          launch.releaseId
            ? db.approval.count({
                where: { tenantId, decision: "approved", assetVersion: { tenantId, asset: { tenantId, type: "release_communication_plan", releaseId: launch.releaseId } } },
              })
            : Promise.resolve(null),
          approvedFor("win_loss_synthesis"),
        ]);
        return {
          approvedClaims,
          staleClaims,
          approvedMessaging: messaging > 0,
          approvedBattlecard: battlecard > 0,
          approvedEnablement: enablement > 0,
          approvedLaunchPlan: opts.forPlan ? null : plan > 0,
          approvedReleasePlan: releasePlan === null ? null : releasePlan > 0,
          approvedWinLoss: winLoss > 0,
          externalReferences: launch.externalReferences,
          internalPilot: launch.internalPilot,
          openRegulatoryAlerts: await (async () => {
            const open = await db.regulatoryChange.count({ where: { tenantId, resolvedAt: null } });
            return open === 0 ? 0 : radarOpenAlerts(launch.productId);
          })(),
        };
      },
      /** Latest decision per phase (for phase order). */
      decisions: (launchId: string) =>
        db.launchDecision.findMany({
          where: { tenantId, launchId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, phase: true, decision: true, createdAt: true },
        }),
      recordDecision: (data: { launchId: string; phase: LaunchPhase; decision: "go" | "no_go"; comment: string | null; readiness: unknown; decidedById: string }) =>
        db.launchDecision.create({ data: { ...data, tenantId, readiness: json(data.readiness) }, select: { id: true } }),
    },

    /** M14: win/loss interviews (pseudonymised; notes only as a consented interview source). */
    winLoss: {
      getById: async (id: string) =>
        orNotFound(
          await db.winLossInterview.findFirst({
            where: { id, tenantId },
            select: { id: true, productId: true, outcome: true, consentStatus: true, sourceId: true },
          }),
          "interview",
        ),
      /** Product and competitor must already be resolved through this DAL (404 on a foreign id). */
      create: (data: {
        productId: string;
        accountLabel: string;
        segment: string;
        outcome: "won" | "lost" | "churned" | "no_decision";
        decidedOn: Date | null;
        competitorId: string | null;
        reasons: string[];
        primaryReason: string;
        interviewedOn: Date | null;
        consentStatus: "requested" | "granted" | "declined";
        consentRecordedAt: Date | null;
        sourceId: string | null;
        isSynthetic?: boolean;
      }) => db.winLossInterview.create({ data: { ...data, tenantId }, select: { id: true } }),
      /** Interviews of a product with the competitor name and the notes source id (stats + synthesis input). */
      listForProduct: (productId: string) =>
        db.winLossInterview.findMany({
          where: { tenantId, productId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            accountLabel: true,
            segment: true,
            outcome: true,
            reasons: true,
            primaryReason: true,
            consentStatus: true,
            sourceId: true,
            updatedAt: true,
            competitor: { select: { name: true } },
          },
        }),
      /** Optimistic: only an interview that is not yet withdrawn. */
      markWithdrawn: async (id: string, at: Date) => {
        const r = await db.winLossInterview.updateMany({
          where: { id, tenantId, consentStatus: { not: "withdrawn" } },
          data: { consentStatus: "withdrawn", consentRecordedAt: at },
        });
        if (r.count !== 1) throw new ConflictError("Interview changed concurrently; reload and try again.");
      },
    },

    kpis: {
      /** The campaign's KPI tree with its measurements (YYYY-MM-DD, number). */
      listForCampaign: async (campaignId: string) => {
        const rows = await db.kpi.findMany({
          where: { tenantId, campaignId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            funnelStage: true,
            definition: true,
            dataSource: true,
            unit: true,
            direction: true,
            aggregation: true,
            target: true,
            baseline: true,
            measurements: { where: { tenantId }, orderBy: { periodStart: "asc" }, select: { periodStart: true, value: true } },
          },
        });
        return rows.map((k) => ({
          ...k,
          target: k.target === null ? null : k.target.toNumber(),
          baseline: k.baseline === null ? null : k.baseline.toNumber(),
          measurements: k.measurements.map((m) => ({ periodStart: m.periodStart.toISOString().slice(0, 10), value: m.value.toNumber() })),
        }));
      },
      getById: async (id: string) =>
        orNotFound(await db.kpi.findFirst({ where: { id, tenantId }, select: { id: true, campaignId: true, name: true } }), "kpi"),
      count: (campaignId: string) => db.kpi.count({ where: { tenantId, campaignId } }),
      countMeasurements: (campaignId: string) => db.kpiMeasurement.count({ where: { tenantId, kpi: { tenantId, campaignId } } }),
      /** The campaign must already be resolved through this DAL. */
      createFromPlan: (campaignId: string, seeds: KpiSeed[], sourceVersionId: string) =>
        db.kpi.createMany({ data: seeds.map((k, position) => ({ ...k, position, tenantId, campaignId, sourceVersionId })) }),
      update: async (id: string, patch: KpiPatch) => {
        const r = await db.kpi.updateMany({ where: { id, tenantId }, data: patch });
        if (r.count !== 1) throw new NotFoundError("kpi");
      },
      /** Same KPI + period start → the value is replaced (and attributed to this import). */
      upsertMeasurement: (m: { kpiId: string; periodStart: Date; value: number; importId: string }) =>
        db.kpiMeasurement.upsert({
          where: { kpiId_periodStart: { kpiId: m.kpiId, periodStart: m.periodStart } },
          create: { tenantId, ...m },
          update: { value: m.value, importId: m.importId },
        }),
      createImport: (data: { campaignId: string; fileName: string; rowCount: number; acceptedRows: number; rejectedRows: unknown; importedById: string | null }) =>
        db.kpiImport.create({ data: { tenantId, ...data, rejectedRows: json(data.rejectedRows) }, select: { id: true } }),
      latestImportId: async (campaignId: string) =>
        (await db.kpiImport.findFirst({ where: { tenantId, campaignId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } }))?.id ?? null,
    },

    knowledge: {
      /**
       * Tenant-scoped read model for gates and agents, plus the classifications
       * of the sources it contains (input to the external-model gate).
       */
      snapshot: async (
        opts: {
          competitorIds?: string[];
          /**
           * M14: agent prompts never see interview notes by default (confidential,
           * consent-bound). Gates (review, export) use the full snapshot. A win/loss
           * run passes the consented interview sources of its product explicitly.
           */
          forAgent?: boolean;
          interviewSourceIds?: string[];
        } = {},
      ): Promise<{
        snapshot: KnowledgeSnapshot;
        sourceClassifications: DataClassification[];
      }> => {
        const [sources, claims, evidence, competitors] = await Promise.all([
          db.source.findMany({
            where: {
              tenantId,
              ...(opts.forAgent ? { OR: [{ kind: { not: "interview" } }, { id: { in: opts.interviewSourceIds ?? [] } }] } : {}),
            },
          }),
          db.claim.findMany({ where: { tenantId }, include: { evidence: { where: { tenantId } } } }),
          db.competitorEvidence.findMany({
            where: { tenantId, ...(opts.competitorIds ? { competitorId: { in: opts.competitorIds } } : {}) },
          }),
          db.competitor.findMany({ where: { tenantId }, select: { id: true, tenantId: true, name: true } }),
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
          snapshot: buildSnapshot({ tenantId, sources: sourceRecords, claims: claimRecords, competitorEvidence: evidenceRecords, competitors }),
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
      create: (data: { type: AssetType; title: string; campaignId?: string | null; releaseId?: string | null; launchId?: string | null }) =>
        db.asset.create({
          data: {
            tenantId,
            type: data.type,
            title: data.title,
            state: "draft",
            campaignId: data.campaignId ?? null,
            releaseId: data.releaseId ?? null,
            launchId: data.launchId ?? null,
          },
          select: { id: true },
        }),
      /**
       * Content of the most recently APPROVED version of an asset of this type
       * that was generated for the given product and persona (via its run's
       * inputRefs) — e.g. the messaging framework used as campaign context.
       */
      /** Most recently APPROVED version of a campaign deliverable of this type (e.g. the campaign plan). */
      latestApprovedForCampaign: async (type: AssetType, campaignId: string): Promise<{ assetId: string; versionId: string; versionNumber: number; content: unknown } | null> => {
        const a = await db.approval.findFirst({
          where: { tenantId, decision: "approved", assetVersion: { tenantId, asset: { tenantId, type, campaignId } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { assetVersion: { select: { id: true, assetId: true, versionNumber: true, content: true } } },
        });
        return a ? { assetId: a.assetVersion.assetId, versionId: a.assetVersion.id, versionNumber: a.assetVersion.versionNumber, content: a.assetVersion.content } : null;
      },
      /**
       * M12: content of the most recently APPROVED version of an asset of this
       * type generated for the given product (via its run's inputRefs) — the use
       * case map as context for the strategy agent.
       */
      latestApprovedForProduct: async (type: AssetType, productId: string): Promise<{ assetId: string; versionId: string; content: unknown } | null> => {
        const a = await db.approval.findFirst({
          where: {
            tenantId,
            decision: "approved",
            assetVersion: {
              tenantId,
              asset: { tenantId, type, versions: { some: { tenantId, workflowRun: { tenantId, inputRefs: { path: ["productId"], equals: productId } } } } },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { assetVersion: { select: { id: true, assetId: true, content: true } } },
        });
        return a ? { assetId: a.assetVersion.assetId, versionId: a.assetVersion.id, content: a.assetVersion.content } : null;
      },
      latestApprovedContent: async (
        type: AssetType,
        forRun: { productId: string; personaId: string },
      ): Promise<{ assetId: string; versionId: string; content: unknown } | null> => {
        const runMatches = {
          tenantId,
          AND: [
            { inputRefs: { path: ["productId"], equals: forRun.productId } },
            { inputRefs: { path: ["personaId"], equals: forRun.personaId } },
          ],
        };
        const a = await db.approval.findFirst({
          where: {
            tenantId,
            decision: "approved",
            assetVersion: { tenantId, asset: { tenantId, type, versions: { some: { tenantId, workflowRun: runMatches } } } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { assetVersion: { select: { id: true, assetId: true, content: true } } },
        });
        return a ? { assetId: a.assetVersion.assetId, versionId: a.assetVersion.id, content: a.assetVersion.content } : null;
      },
      /**
       * M16: every deliverable with its current version and its latest approved
       * version (if different) — the input of the regulatory impact analysis.
       */
      listForImpact: async () => {
        const rows = await db.asset.findMany({
          where: { tenantId, type: { notIn: [...INTERNAL_ASSET_TYPES] }, state: { not: "archived" } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            state: true,
            currentVersionId: true,
            versions: {
              where: { tenantId },
              orderBy: { versionNumber: "desc" },
              select: { id: true, content: true, approvals: { where: { tenantId, decision: "approved" }, select: { id: true }, take: 1 } },
            },
          },
        });
        return rows.map((a) => {
          const current = a.versions.find((v) => v.id === a.currentVersionId) ?? a.versions[0];
          const approved = a.versions.find((v) => v.approvals.length > 0);
          const versions = [approved, current].filter((v, i, arr): v is NonNullable<typeof v> => !!v && arr.findIndex((x) => x?.id === v.id) === i);
          return { assetId: a.id, title: a.title, state: a.state, versions: versions.map((v) => ({ versionId: v.id, content: v.content })) };
        });
      },
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
      /** Claims (with evidence) as domain records — e.g. to find claims that cite a changed source. */
      listRecords: async (): Promise<ClaimRecord[]> =>
        (await db.claim.findMany({ where: { tenantId }, include: { evidence: { where: { tenantId } } } })).map(toClaimRecord),
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
      /** M14: the notes of a consented interview, stored as a confidential interview source. */
      createInterview: (data: { title: string; content: string; contentHash: string; retrievedAt: Date; isSynthetic?: boolean }) =>
        db.source.create({
          data: { tenantId, kind: "interview", classification: "confidential", url: null, publisher: null, status: "active", ...data },
          select: { id: true },
        }),
      /**
       * M14 consent withdrawn: the notes are erased and the source is invalid —
       * anything that cited it fails gate G4 on its next check.
       */
      erase: async (id: string, placeholder: string, contentHash: string) => {
        const r = await db.source.updateMany({
          where: { id, tenantId },
          data: { content: placeholder, contentHash, status: "invalid", version: { increment: 1 } },
        });
        if (r.count !== 1) throw new NotFoundError("source");
      },
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
        /** Campaign runs only; the campaign must already be resolved through this DAL. */
        campaignId?: string | null;
        /** M12 release_communication only; the release must already be resolved through this DAL. */
        releaseId?: string | null;
        /** M15 launch_planning only; the launch must already be resolved through this DAL. */
        launchId?: string | null;
      }) =>
        db.workflowRun.create({
          data: {
            tenantId,
            kind: data.kind,
            campaignId: data.campaignId ?? null,
            releaseId: data.releaseId ?? null,
            launchId: data.launchId ?? null,
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
  radarOpenAlerts = api.radar.openAlertsForProduct;
  return api;
}

function toClaimRecord(c: {
  id: string;
  tenantId: string;
  text: string;
  category: ClaimRecord["category"];
  state: ClaimState;
  isSynthetic: boolean;
  conditions?: string[];
  evidence: { sourceId: string; excerpt: string; locator: string | null }[];
}): ClaimRecord {
  return {
    id: c.id,
    tenantId: c.tenantId,
    text: c.text,
    category: c.category,
    state: c.state,
    isSynthetic: c.isSynthetic,
    conditions: c.conditions ?? [],
    evidence: c.evidence.map((e) => ({ sourceId: e.sourceId, excerpt: e.excerpt, locator: e.locator })),
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;

/** Runs fn inside one interactive transaction with a tenant-scoped DAL. */
export function withTenantTx<T>(actor: Actor, db: Db, fn: (tdb: TenantDb) => Promise<T>): Promise<T> {
  return db.$transaction((tx) => fn(tenantDb(actor, tx)), { timeout: 30_000, maxWait: 10_000 });
}
