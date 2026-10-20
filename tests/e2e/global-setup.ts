import { seed } from "../../prisma/seed";
import { createPrismaClient } from "../../src/server/db/client";
import { resetDemoData } from "../../src/server/demo/reset";

/** Clean demo tenants on the TEST database and re-seed with the run's random password. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  const password = process.env.E2E_PASSWORD;
  if (!url || !process.env.TEST_DATABASE_URL || url !== process.env.TEST_DATABASE_URL) {
    throw new Error("E2E must run via `npm run test:e2e` (DATABASE_URL must be the test database).");
  }
  if (!password) throw new Error("E2E_PASSWORD missing");
  const db = createPrismaClient(url);
  try {
    await resetDemoData(db, { env: { NODE_ENV: "test" } });
    await seed(db, { password });
  } finally {
    await db.$disconnect();
  }
}
