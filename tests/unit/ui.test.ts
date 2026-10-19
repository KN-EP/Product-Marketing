import { describe, expect, it } from "vitest";
import {
  DEMO_CLAIMS,
  DEMO_COMPETITOR_EVIDENCE,
  DEMO_SOURCES,
  DEMO_TENANT_ID,
  SIMULATED_BATTLECARD_CORRECTED,
  SIMULATED_BATTLECARD_FLAWED,
  SIMULATED_MESSAGING_FRAMEWORK,
} from "@/demo/fixtures";
import type { Actor } from "@/domain/actor";
import { addVersion, decide, generationLabel, submitForReview, type AssetRecord } from "@/domain/assets/asset-state";
import { exportApprovedMarkdown } from "@/domain/export/markdown";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { runQualityGates } from "@/domain/quality-gates/gates";
import { collectStatements } from "@/domain/schemas/agents";
import { childPath, humanise, parsePath, setAtPath, statementAnchor } from "@/lib/content-paths";

describe("content paths (shared by renderer, gate links and editor)", () => {
  it("parses the collectStatements / gate path format", () => {
    expect(parsePath("$")).toEqual([]);
    expect(parsePath("$.pillars[0].proofPoints[1]")).toEqual(["pillars", 0, "proofPoints", 1]);
    expect(() => parsePath("pillars[0]")).toThrow();
    expect(() => parsePath("$.a..b")).toThrow();
  });

  it("childPath builds exactly the paths collectStatements and the gates use", () => {
    const paths = collectStatements(SIMULATED_MESSAGING_FRAMEWORK).map((x) => x.path);
    expect(paths).toContain(childPath(childPath(childPath("$", "pillars"), 0), "message"));
    const report = runQualityGates("competitive_battlecard", SIMULATED_BATTLECARD_FLAWED, buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: DEMO_CLAIMS }));
    const statementPaths = new Set(collectStatements(SIMULATED_BATTLECARD_FLAWED).map((x) => x.path));
    const critical = report.findings.filter((f) => f.severity === "critical" && f.gate !== "G1_schema");
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.every((f) => statementPaths.has(f.path))).toBe(true); // every finding can link to its statement
  });

  it("anchors are unique and DOM-safe", () => {
    const paths = collectStatements(SIMULATED_MESSAGING_FRAMEWORK).map((x) => x.path);
    const anchors = paths.map(statementAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors.every((a) => /^[A-Za-z][A-Za-z0-9-]*$/.test(a))).toBe(true);
  });

  it("setAtPath returns an edited deep copy and never mutates the original", () => {
    const original = structuredClone(SIMULATED_MESSAGING_FRAMEWORK);
    const edited = setAtPath(original, "$.pillars[1].message", "text", "Edited");
    expect((edited as typeof original).pillars[1]!.message.text).toBe("Edited");
    expect(original.pillars[1]!.message.text).not.toBe("Edited");
    expect(() => setAtPath(original, "$.pillars[9].message", "text", "x")).toThrow(/Path not found/);
  });

  it("humanise", () => {
    expect(humanise("positioningStatement")).toBe("Positioning statement");
    expect(humanise("whereWeWin")).toBe("Where we win");
  });
});

describe("human_edit provenance in the domain", () => {
  const kb = () => buildSnapshot({ tenantId: DEMO_TENANT_ID, sources: DEMO_SOURCES, claims: DEMO_CLAIMS, competitorEvidence: DEMO_COMPETITOR_EVIDENCE });
  const system: Actor = { kind: "system", userId: null, tenantId: DEMO_TENANT_ID, role: "editor" };
  const editor: Actor = { kind: "human", userId: "u_ed", tenantId: DEMO_TENANT_ID, role: "editor" };
  const reviewer: Actor = { kind: "human", userId: "u_rev", tenantId: DEMO_TENANT_ID, role: "reviewer" };

  it("labels versions and the export", () => {
    let a: AssetRecord = { id: "a1", tenantId: DEMO_TENANT_ID, type: "competitive_battlecard", title: "BC", state: "draft", currentVersionId: null, versions: [], approvals: [] };
    a = addVersion(a, SIMULATED_BATTLECARD_FLAWED, system, kb(), { id: "v1", generationMode: "simulated" });
    a = addVersion(a, SIMULATED_BATTLECARD_CORRECTED, editor, kb(), { id: "v2", generationMode: "human_edit", basedOnVersionId: "v1" });
    expect(generationLabel(a, a.versions[0]!)).toBe("Simulated");
    expect(generationLabel(a, a.versions[1]!)).toBe("Human-edited (based on v1)");
    a = decide(submitForReview(a, editor), reviewer, kb(), { versionId: "v2", decision: "approved" }).asset;
    const md = exportApprovedMarkdown(a, reviewer, kb(), () => "R");
    expect(md).toContain("| Generation | Human-edited (based on v1), human-reviewed |");
  });
});
