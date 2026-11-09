import type { Db } from "../db/client";

export class DemoResetRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoResetRefused";
  }
}

export interface DemoResetCounts {
  tenants: string[];
  approvals: number;
  assetVersions: number;
  assets: number;
  workflowRuns: number;
  campaigns: number;
  releases: number;
  interviews: number;
  launches: number;
  auditEvents: number;
}

/**
 * Deletes workflow runs, assets, asset versions, approvals, campaigns, releases
 * and THEIR audit events — for demo tenants (isDemo = true) only. Seeded
 * campaigns and releases are re-created by the seed. Refuses in production and
 * when any requested tenant is not a demo tenant. Seeding is done by the caller.
 * Operational tool (not tenant-scoped to an actor): it may only ever touch
 * tenants that are flagged as demo tenants in the database.
 */
export async function resetDemoData(
  db: Db,
  opts: { env?: Record<string, string | undefined>; tenantSlugs?: string[] } = {},
): Promise<DemoResetCounts> {
  const env = opts.env ?? process.env;
  if (env.NODE_ENV === "production") throw new DemoResetRefused("Refusing to reset demo data when NODE_ENV=production.");

  let tenants: { id: string; slug: string; isDemo: boolean }[];
  if (opts.tenantSlugs?.length) {
    tenants = await db.tenant.findMany({ where: { slug: { in: opts.tenantSlugs } }, select: { id: true, slug: true, isDemo: true } });
    const missing = opts.tenantSlugs.filter((s) => !tenants.some((t) => t.slug === s));
    if (missing.length) throw new DemoResetRefused(`Unknown tenant(s): ${missing.join(", ")}.`);
    const notDemo = tenants.filter((t) => !t.isDemo);
    if (notDemo.length) throw new DemoResetRefused(`Refusing: not a demo tenant: ${notDemo.map((t) => t.slug).join(", ")}.`);
  } else {
    tenants = await db.tenant.findMany({ where: { isDemo: true }, select: { id: true, slug: true, isDemo: true } });
  }
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return { tenants: [], approvals: 0, assetVersions: 0, assets: 0, workflowRuns: 0, campaigns: 0, releases: 0, interviews: 0, launches: 0, auditEvents: 0 };

  return db.$transaction(
    async (tx) => {
      // Defense in depth: every delete is restricted to tenants that are demo tenants right now.
      const where = { tenantId: { in: ids }, tenant: { isDemo: true } };
      const approvals = await tx.approval.deleteMany({ where });
      const assetVersions = await tx.assetVersion.deleteMany({ where });
      const assets = await tx.asset.deleteMany({ where });
      const workflowRuns = await tx.workflowRun.deleteMany({ where });
      // After assets and runs: both reference campaigns (ON DELETE RESTRICT).
      // KPIs, imports and measurements go with their campaign (ON DELETE CASCADE).
      const campaigns = await tx.campaign.deleteMany({ where });
      // M12: releases are referenced by assets and runs too (ON DELETE RESTRICT).
      // M15: launches reference releases and are referenced by assets and runs (deleted above);
      // their decisions go with them (ON DELETE CASCADE).
      const launches = await tx.launch.deleteMany({ where });
      const releases = await tx.release.deleteMany({ where });
      // M14: interviews first (they reference their notes source), then the unreferenced interview sources.
      const interviews = await tx.winLossInterview.deleteMany({ where });
      await tx.source.deleteMany({ where: { ...where, kind: "interview", claimEvidence: { none: {} }, competitorEvidence: { none: {} } } });
      const auditEvents = await tx.auditEvent.deleteMany({
        where: { ...where, entityType: { in: ["Asset", "WorkflowRun", "Campaign", "Kpi", "Release", "WinLossInterview", "Launch"] } },
      });
      return {
        tenants: tenants.map((t) => t.slug),
        approvals: approvals.count,
        assetVersions: assetVersions.count,
        assets: assets.count,
        workflowRuns: workflowRuns.count,
        campaigns: campaigns.count,
        releases: releases.count,
        interviews: interviews.count,
        launches: launches.count,
        auditEvents: auditEvents.count,
      };
    },
    { timeout: 60_000 },
  );
}
