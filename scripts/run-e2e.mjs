// E2E runner (Playwright). Never prints connection strings.
//
// 1. Requires TEST_DATABASE_URL; without it prints NOT EXECUTED and exits 2.
// 2. Refuses if the test URL points at the app or migration database.
// 3. Migrates the test DB, builds the app, then runs Playwright. Playwright
//    starts `next start` against the TEST database in SIMULATED mode; global
//    setup resets the demo tenants and re-seeds them with a random password.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("E2E TESTS NOT EXECUTED: TEST_DATABASE_URL is not set.");
  process.exit(2);
}
const target = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return null;
  }
};
for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
  if (process.env[name] && target(process.env[name]) === target(testUrl)) {
    console.error(`Refusing to run: TEST_DATABASE_URL points at the same database as ${name}.`);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  MIGRATION_DATABASE_URL: process.env.TEST_MIGRATION_DATABASE_URL || testUrl,
  DATABASE_URL: testUrl,
  SESSION_SECRET: randomBytes(32).toString("base64url"),
  E2E_PASSWORD: randomBytes(18).toString("base64url"),
  LLM_MODE: "simulated",
  ANTHROPIC_API_KEY: "",
  DEMO_MODE: "true",
};

const bin = (pkg, name = pkg) => {
  const manifest = require.resolve(`${pkg}/package.json`);
  const b = require(manifest).bin;
  return join(dirname(manifest), typeof b === "string" ? b : b[name]);
};
function run(label, script, args, extraEnv = {}) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit", env: { ...env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`✖ ${label} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

run("prisma migrate deploy (test database)", bin("prisma"), ["migrate", "deploy"]);
run("next build", bin("next"), ["build"], { NODE_ENV: "production" });
run("playwright test", bin("@playwright/test", "playwright"), ["test", ...process.argv.slice(2)]);
