/**
 * npm run demo:reset [-- --tenant <slug> ...]
 *
 * Deletes workflow runs, assets, versions, approvals and their audit events
 * for DEMO tenants only (isDemo = true), then re-seeds the synthetic demo data.
 * Refuses when NODE_ENV=production or when a named tenant is not a demo tenant.
 * Prints counts only — never connection strings.
 */
import "dotenv/config";
import { createPrismaClient } from "../src/server/db/client";
import { DemoResetRefused, resetDemoData } from "../src/server/demo/reset";
import { seed } from "../prisma/seed";

function tenantArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--tenant" && argv[i + 1]) out.push(argv[++i]!);
  return out;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new DemoResetRefused("Refusing to reset demo data when NODE_ENV=production.");
  const url = process.env.DATABASE_URL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!password) throw new Error("DEMO_USER_PASSWORD is not set (needed to re-seed demo users)");

  const db = createPrismaClient(url);
  try {
    const counts = await resetDemoData(db, { tenantSlugs: tenantArgs(process.argv.slice(2)) });
    console.log(`Demo tenants reset: ${counts.tenants.join(", ") || "(none found)"}`);
    console.log(
      `Deleted: ${counts.workflowRuns} workflow runs, ${counts.assets} assets, ${counts.assetVersions} versions, ` +
        `${counts.approvals} approvals, ${counts.auditEvents} audit events.`,
    );
    await seed(db, { password });
    console.log("Re-seeded synthetic demo data.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("demo:reset failed:", e instanceof DemoResetRefused ? e.message : e instanceof Error ? e.name : "unknown error");
  process.exit(1);
});
