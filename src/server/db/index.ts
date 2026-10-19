import "server-only";
import { createPrismaClient, type Db } from "./client";

const globalForDb = globalThis as unknown as { __pmmDb?: Db };

/**
 * The application's client. Connects as the DML-only role (DATABASE_URL),
 * never with MIGRATION_DATABASE_URL. Pages, routes and actions must not use it
 * for tenant-owned data directly — go through tenantDb(actor, getDb()).
 */
export function getDb(): Db {
  if (!globalForDb.__pmmDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__pmmDb = createPrismaClient(url);
  }
  return globalForDb.__pmmDb;
}
