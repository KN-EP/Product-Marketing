import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ID_ENTRYPOINTS, SERVER_ACTIONS } from "../integration/entrypoints";

const ROOT = join(import.meta.dirname, "..", "..");
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const appFiles = walk(join(ROOT, "src", "app")).filter((f) => /\.tsx?$/.test(f));

describe("tenant-isolation coverage (static)", () => {
  it("every id-taking route/page is registered for the cross-tenant integration test", () => {
    const idEntrypoints = appFiles
      .map(rel)
      .filter((f) => /\[[^\]]+\]/.test(f) && /\/(page\.tsx|route\.ts)$/.test(f));
    const routes = appFiles.map(rel).filter((f) => f.endsWith("/route.ts"));
    expect([...new Set([...idEntrypoints, ...routes])].sort()).toEqual([...ID_ENTRYPOINTS].sort());
  });

  it("every server action is registered", () => {
    const actions = appFiles
      .filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")))
      .flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => `${rel(f)}#${m[1]}`),
      );
    expect(actions.sort()).toEqual(Object.keys(SERVER_ACTIONS).sort());
  });

  it("app code never queries tenant-owned models without tenantDb()", () => {
    for (const f of appFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/getDb\(\)\s*\./);
      expect(src, rel(f)).not.toMatch(/generated\/prisma/);
    }
  });
});
