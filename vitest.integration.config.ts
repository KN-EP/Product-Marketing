import { defineConfig } from "vitest/config";
import { alias } from "./vitest.config";

// Run via `npm run test:integration` (scripts/run-integration-tests.mjs), which
// migrates the TEST database and points DATABASE_URL at it for this process.
export default defineConfig({
  resolve: { alias },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
