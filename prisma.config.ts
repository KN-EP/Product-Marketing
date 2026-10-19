import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI (migrate) connects as the schema OWNER via MIGRATION_DATABASE_URL.
// The running app never uses this URL: it connects as the DML-only role through
// DATABASE_URL (src/server/db). Read via process.env rather than env() so that
// `prisma generate` works without database credentials; migrate commands fail
// with a Prisma error if the variable is missing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.MIGRATION_DATABASE_URL },
});
