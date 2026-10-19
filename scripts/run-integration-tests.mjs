// Integration test runner. Never prints connection strings.
//
// 1. Requires TEST_DATABASE_URL (a separate database / Neon branch). If it is
//    missing, prints NOT EXECUTED and exits with code 2 — it never skips silently.
// 2. Refuses to run if the test URL points at the app or migration database.
// 3. Applies migrations to the test DB (TEST_MIGRATION_DATABASE_URL, falling
//    back to TEST_DATABASE_URL), then runs Vitest with DATABASE_URL = test DB.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  console.error("INTEGRATION TESTS NOT EXECUTED: TEST_DATABASE_URL is not set.");
  process.exit(2);
}

function target(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return null;
  }
}

const testTarget = target(testUrl);
if (!testTarget) {
  console.error("TEST_DATABASE_URL is not a valid URL.");
  process.exit(1);
}
for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  const v = process.env[name];
  if (v && target(v) === testTarget) {
    console.error(`Refusing to run: TEST_DATABASE_URL points at the same database as ${name}.`);
    process.exit(1);
  }
}

const childEnv = {
  ...process.env,
  MIGRATION_DATABASE_URL: process.env.TEST_MIGRATION_DATABASE_URL || testUrl,
  DATABASE_URL: testUrl,
  SESSION_SECRET: randomBytes(32).toString("base64url"),
  // Integration tests never call a real model.
  LLM_MODE: "simulated",
  ANTHROPIC_API_KEY: "",
};

function run(label, script, args) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit", env: childEnv });
  if (r.status !== 0) {
    console.error(`✖ ${label} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

const bin = (pkg) => {
  const manifest = require.resolve(`${pkg}/package.json`);
  const b = require(manifest).bin;
  return join(dirname(manifest), typeof b === "string" ? b : b[pkg]);
};

run("prisma migrate deploy (test database)", bin("prisma"), ["migrate", "deploy"]);
run("vitest (integration)", bin("vitest"), ["run", "-c", "vitest.integration.config.ts"]);
