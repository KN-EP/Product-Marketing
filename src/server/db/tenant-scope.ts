import type { Actor } from "../../domain/actor";
import { NotFoundError } from "../errors";
import type { Db } from "./client";

function orNotFound<T>(row: T | null, entity: string): T {
  if (row === null) throw new NotFoundError(entity);
  return row;
}

/**
 * Tenant-scoped data-access layer. The tenant comes from the resolved Actor
 * only; every query below filters on it, including nested relations. Lookups
 * by id use findFirst({ where: { id, tenantId } }) and throw NotFoundError on
 * a miss — identical for "missing" and "belongs to another tenant".
 */
export function tenantDb(actor: Actor, db: Db) {
  const tenantId = actor.tenantId;
  if (!tenantId) throw new Error("tenantDb requires an actor with a tenantId");

  return {
    tenantId,

    tenant: {
      get: async () =>
        orNotFound(
          await db.tenant.findFirst({
            where: { id: tenantId },
            select: { id: true, slug: true, name: true, isDemo: true },
          }),
          "tenant",
        ),
    },

    counts: async () => {
      const [assets, claims, sources] = await Promise.all([
        db.asset.count({ where: { tenantId } }),
        db.claim.count({ where: { tenantId } }),
        db.source.count({ where: { tenantId } }),
      ]);
      return { assets, claims, sources };
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
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;
