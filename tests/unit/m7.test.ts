/** M7 unit tests: A1–A5 (display rules), C10 (rate limits, headers, body limit), C11 (log sanitizer). */
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/" }));
vi.mock("@/app/actions/review", () => ({
  decideAction: vi.fn(),
  createDraftVersionAction: vi.fn(),
  exportMarkdownAction: vi.fn(),
  submitForReviewAction: vi.fn(),
}));

import { DecisionForm } from "@/components/review/decision-form";
import { StructuredEditor } from "@/components/review/structured-editor";
import { SyntheticBanner } from "@/components/synthetic-banner";
import { SIMULATED_BATTLECARD_CORRECTED, SIMULATED_BATTLECARD_FLAWED } from "@/demo/fixtures";
import type { Finding } from "@/domain/quality-gates/gates";
import { groupFindings, sourceOfFinding } from "@/lib/findings";
import { BODY_LIMITS, contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import { proxy } from "@/proxy";
import { assertDeliverable, DELIVERABLE_ASSET_TYPES, isInternalAssetType } from "@/server/assets/deliverables";
import { enforceRateLimit, RATE_LIMITS, RateLimiter, resetRateLimits } from "@/server/http/rate-limit";
import { log, sanitize, sanitizeString } from "@/server/log";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("A1 — three deliverables; the input brief is internal", () => {
  it("only the Agent A brief is internal", () => {
    expect(isInternalAssetType("product_intelligence_brief")).toBe(true);
    expect(DELIVERABLE_ASSET_TYPES).toEqual([
      "messaging_framework",
      "competitive_battlecard",
      "regulatory_gtm_brief",
      // M8–M10 campaign package
      "campaign_plan",
      "content_matrix",
      "sales_play",
      // M11
      "performance_review",
      // M12 strategy first
      "use_case_map",
      "gtm_strategy_brief",
      "release_communication_plan",
    ]);
    expect(() => assertDeliverable("product_intelligence_brief")).toThrow(expect.objectContaining({ status: 409, code: "internal_input" }));
    expect(() => assertDeliverable("competitive_battlecard")).not.toThrow();
  });
});

describe("A2 — prepared correction only pre-fills the editor", () => {
  const props = { assetId: "a1", baseVersionNumber: 1, content: SIMULATED_BATTLECARD_FLAWED };
  it("shows the demo button only when a prepared correction is provided; Save starts disabled; Cancel exists", () => {
    const without = html(createElement(StructuredEditor, { ...props, preparedCorrection: null }));
    expect(without).not.toContain("Load prepared correction (simulated)");
    const withPrepared = html(createElement(StructuredEditor, { ...props, preparedCorrection: SIMULATED_BATTLECARD_CORRECTED }));
    expect(withPrepared).toContain("Load prepared correction (simulated)");
    expect(withPrepared).toContain("It is not stored until you save");
    expect(withPrepared).toMatch(/<button type="submit"[^>]*disabled[^>]*>Save as new version \(based on v1\)/);
    expect(withPrepared).toContain(">Cancel</button>");
  });
});

describe("A3 — decision form has no pre-selected decision", () => {
  it("no radio is checked and the submit button is disabled", () => {
    const out = html(
      createElement(DecisionForm, { assetId: "a1", versionId: "v1", versionNumber: 1, requiresExpertReview: false, approveBlockedReasons: [] }),
    );
    expect(out).not.toMatch(/type="radio"[^>]*checked/);
    expect(out).toMatch(/<button type="submit"[^>]*disabled[^>]*>Record decision/);
    expect(out).toContain("Choose a decision.");
  });
});

describe("A4 — findings grouped for display, stored report unchanged", () => {
  const f = (gate: Finding["gate"], severity: Finding["severity"], path: string, message: string): Finding => ({ gate, severity, path, message });
  const findings: Finding[] = [
    f("G4_excerpts_exist", "info", "$.a", "Source src_x is synthetic demo data"),
    f("G4_excerpts_exist", "info", "$.a", "Source src_x is synthetic demo data"),
    f("G4_excerpts_exist", "info", "$.a", "Source src_y is synthetic demo data"),
    f("G4_excerpts_exist", "critical", "$.a", "Excerpt not found in stored source src_x"),
    f("G4_excerpts_exist", "info", "$.b", "Source src_x is synthetic demo data"),
  ];

  it("groups identical (gate, path, source) findings with a count; different severity/path/source stay separate", () => {
    const before = structuredClone(findings);
    const groups = groupFindings(findings);
    expect(groups).toHaveLength(4);
    expect(groups[0]).toMatchObject({ path: "$.a", sourceId: "src_x", severity: "info", count: 2 });
    expect(groups.find((g) => g.sourceId === "src_y")?.count).toBe(1);
    expect(groups.find((g) => g.severity === "critical")).toMatchObject({ sourceId: "src_x", count: 1 });
    expect(findings).toEqual(before); // input (the stored report) untouched
  });

  it("parses the source from gate messages", () => {
    expect(sourceOfFinding("Unknown source reference: src_a")).toBe("src_a");
    expect(sourceOfFinding("Excerpt not found in stored source src_b")).toBe("src_b");
    expect(sourceOfFinding("Source src_c is changed; evidence must be re-checked")).toBe("src_c");
    expect(sourceOfFinding("Statement labelled as fact has no approved claim behind it")).toBeNull();
  });
});

describe("A5 — banner names the current tenant", () => {
  it("uses the tenant name and no hardcoded tenant", () => {
    const out = html(createElement(SyntheticBanner, { tenantName: "Other Demo Tenant – Synthetic" }));
    expect(out).toContain("SYNTHETIC DATA");
    expect(out).toContain("Other Demo Tenant – Synthetic");
    expect(out).not.toContain("DataGuard");
    expect(html(createElement(SyntheticBanner, {}))).not.toContain("DataGuard");
  });
});

describe("C10 — rate limits", () => {
  beforeEach(() => resetRateLimits());

  it("sliding window: blocks after the limit, allows again after the window", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    const rule = { limit: 3, windowMs: 1000 };
    expect([1, 2, 3].map(() => rl.check("k", rule).ok)).toEqual([true, true, true]);
    expect(rl.check("k", rule)).toMatchObject({ ok: false });
    expect(rl.check("other", rule).ok).toBe(true);
    t = 1001;
    expect(rl.check("k", rule).ok).toBe(true);
  });

  it("enforceRateLimit throws 429 rate_limited for decisions beyond the limit", () => {
    for (let i = 0; i < RATE_LIMITS.decision.limit; i++) enforceRateLimit("decision", "t:u");
    expect(() => enforceRateLimit("decision", "t:u")).toThrow(expect.objectContaining({ status: 429, code: "rate_limited" }));
    expect(() => enforceRateLimit("decision", "t:other")).not.toThrow();
  });
});

describe("C10 — security headers and body limits", () => {
  it("CSP forbids framing and plugins; no unsafe-eval in production", () => {
    const prod = contentSecurityPolicy(false);
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("default-src 'self'");
    expect(prod).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(true)).toContain("unsafe-eval");
  });

  it("sets referrer-policy, frame and sniffing protections; HSTS only in production", () => {
    const keys = (dev: boolean) => Object.fromEntries(securityHeaders(dev).map((h) => [h.key, h.value]));
    expect(keys(false)).toMatchObject({
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    });
    expect(keys(false)["Strict-Transport-Security"]).toBeDefined();
    expect(keys(true)["Strict-Transport-Security"]).toBeUndefined();
  });

  it("proxy rejects API bodies above the limit with 413, lets small ones through", async () => {
    const big = new NextRequest("http://localhost/api/workflows", { method: "POST", headers: { "content-length": String(BODY_LIMITS.apiBytes + 1) } });
    const res = proxy(big);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    const ok = proxy(new NextRequest("http://localhost/api/workflows", { method: "POST", headers: { "content-length": "100" } }));
    expect(ok.status).toBe(200);
  });
});

describe("C11 — log sanitizer", () => {
  it("redacts connection strings, keys, tokens, JWTs, secrets and e-mails", () => {
    const s = sanitizeString(
      "db postgresql://pmm_app:s3cret@db.example.invalid/db?sslmode=verify-full key sk-ant-EXAMPLE-not-a-key auth Bearer abc.def.ghi " +
        "jwt eyJhbGciOi.eyJzdWIiOi.sig password=hunter2 mail anna@example.com",
    );
    for (const leaked of ["s3cret", "db.example.invalid", "sk-ant-EXAMPLE", "hunter2", "anna@example.com", "eyJhbGciOi"]) expect(s).not.toContain(leaked);
    expect(s).toContain("[redacted-url]");
    expect(s).toContain("[redacted-email]");
  });

  it("drops prompt/content fields and secret-named fields; errors keep name + sanitized message", () => {
    const out = sanitize({
      runId: "r1",
      prompt: "SYSTEM: you are …",
      messages: [{ role: "user", content: "secret product plans" }],
      apiKey: "abc",
      error: new Error("failed for bob@corp.com"),
      nested: { content: "x", ok: 1 },
    }) as Record<string, unknown>;
    expect(out).toMatchObject({
      runId: "r1",
      prompt: "[redacted-content]",
      messages: "[redacted-content]",
      apiKey: "[redacted]",
      error: { name: "Error", message: "failed for [redacted-email]" },
      nested: { content: "[redacted-content]", ok: 1 },
    });
  });

  it("truncates long strings and the logger emits sanitized JSON", () => {
    expect(sanitizeString("x".repeat(2000)).length).toBeLessThan(600);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("run failed postgres://u:p@h/db", { error: new Error("token=abc123") });
    const line = String(spy.mock.calls[0]![0]);
    spy.mockRestore();
    expect(line).not.toContain("u:p@h");
    expect(line).not.toContain("abc123");
    expect(JSON.parse(line)).toMatchObject({ level: "error" });
  });
});
