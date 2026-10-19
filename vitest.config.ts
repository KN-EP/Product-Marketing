import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
