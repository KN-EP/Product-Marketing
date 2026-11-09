/**
 * M17 — gates for industrial copy (DE + EN), from a trial with a machine builder
 * (public data, packaging / medical / appliance): German comparatives and superlatives,
 * "immer/nie", regulatory vocabulary (PFAS, PPWR, MDR, FDA/GMP, CE, food contact),
 * product conformity (G7c), named competitors (G7b) and claim conditions (G17).
 */
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/domain/knowledge/snapshot";
import { runQualityGates, type Finding } from "@/domain/quality-gates/gates";

const T = "ten_m17";
const LAW = "Die Verordnung gilt ab dem 12. August 2026. Ab diesem Datum gelten Grenzwerte für PFAS.";
const kb = buildSnapshot({
  tenantId: T,
  sources: [
    { id: "src_law", tenantId: T, title: "Law", url: null, status: "active", content: LAW, isSynthetic: true },
    { id: "src_lab", tenantId: T, title: "Lab report", url: null, status: "active", content: "Laborbericht: keine PFAS oberhalb der Nachweisgrenze.", isSynthetic: true },
  ],
  claims: [
    { id: "clm_output", tenantId: T, text: "Die Anlage wird mit bis zu 50 % höherem Ausstoß bei vergleichbarer Stellfläche beworben.", category: "product_capability", state: "approved", evidence: [], isSynthetic: true, conditions: ["bei vergleichbarer Stellfläche"] },
    { id: "clm_service", tenantId: T, text: "22 Service-Center, 10 Parts-Center und 80 Servicetechniker.", category: "commercial", state: "approved", evidence: [], isSynthetic: true },
    { id: "clm_pfas", tenantId: T, text: "Die Barriere ist PFAS-frei.", category: "compliance", state: "approved", evidence: [{ sourceId: "src_lab", excerpt: "keine PFAS oberhalb der Nachweisgrenze" }], isSynthetic: true },
    { id: "clm_pfas_unproven", tenantId: T, text: "Die Barriere ist PFAS-frei.", category: "compliance", state: "approved", evidence: [], isSynthetic: true },
  ],
  competitorEvidence: [{ id: "cev_a", tenantId: T, competitorId: "cmp_a", sourceId: "src_law", assertion: "x", excerpt: "x", state: "approved" }],
  competitors: [
    { id: "cmp_a", tenantId: T, name: "ILLIG" },
    { id: "cmp_b", tenantId: T, name: "WM Thermoforming Machines" },
  ],
});

const S = (text: string, kind: "fact" | "interpretation" | "hypothesis" | "suggestion", o: Record<string, unknown> = {}) => ({
  text, kind, claimIds: [], competitorEvidenceIds: [], evidence: [], kpiRefs: [], regulatory: false, comparative: false, ...o,
});
const brief = (st: ReturnType<typeof S>) => ({
  schemaVersion: "regulatory_gtm_brief.v1",
  regulatoryContext: S("Kontext.", "suggestion"),
  buyerImplications: [st],
  messagingImplications: [],
  salesDiscoveryQuestions: ["a", "b", "c"],
  plays: [],
  doNotSay: [],
  expertValidationRequired: [],
  approvalChecklist: ["x"],
});
const on = (st: ReturnType<typeof S>): Finding[] => runQualityGates("regulatory_gtm_brief", brief(st), kb).findings.filter((f) => f.path === "$.buyerImplications[0]");
const crit = (st: ReturnType<typeof S>, gate: string) => on(st).some((f) => f.gate === gate && f.severity === "critical");
const any = (st: ReturnType<typeof S>, gate: string) => on(st).some((f) => f.gate === gate);

describe("M17 · comparisons (G7b)", () => {
  it("a German comparative naming a competitor is a comparison — even with an own approved claim", () => {
    expect(crit(S("Höherer Ausstoß als ILLIG bei gleicher Stellfläche.", "fact", { claimIds: ["clm_output"] }), "G7b_comparative_support")).toBe(true);
    expect(crit(S("Schnellere Taktzeiten als jeder Wettbewerber.", "interpretation"), "G7b_comparative_support")).toBe(true);
    expect(crit(S("Die niedrigsten Stückkosten im Markt.", "interpretation"), "G7b_comparative_support")).toBe(true);
  });
  it("evidence about one competitor does not cover a comparison with another", () => {
    const f = on(S("Schnellere Ersatzteilversorgung als WM Thermoforming Machines.", "fact", { claimIds: ["clm_service"], competitorEvidenceIds: ["cev_a"] }));
    expect(f.some((x) => x.gate === "G7b_comparative_support" && x.severity === "critical" && x.message.includes("WM Thermoforming Machines"))).toBe(true);
    expect(any(S("Höherer Ausstoß als ILLIG.", "interpretation", { competitorEvidenceIds: ["cev_a"] }), "G7b_comparative_support")).toBe(false);
  });
  it("a competitor is also recognised by its upper-case brand word ('WM'), case-sensitively", () => {
    expect(crit(S("Schnellere Ersatzteilversorgung als WM.", "fact", { claimIds: ["clm_service"] }), "G7b_comparative_support")).toBe(true);
    expect(any(S("Schnellere Ersatzteilversorgung als wm.", "hypothesis"), "G7b_comparative_support")).toBe(false);
  });
  it("no false alarms: quantities, comparisons without a market reference, 'immer mehr'", () => {
    expect(on(S("Mehr als 800 Mitarbeitende weltweit.", "fact", { claimIds: ["clm_service"] }))).toEqual([]);
    expect(any(S("Die Zahl der Systeme wächst schneller als das Team prüfen kann.", "hypothesis"), "G7b_comparative_support")).toBe(false);
    expect(any(S("AI systems spread faster than an inventory can follow.", "hypothesis"), "G7b_comparative_support")).toBe(false);
    expect(crit(S("Immer mehr Kunden stellen auf Faser um.", "interpretation"), "G5_unsupported_assertions")).toBe(false);
  });
  it("a superlative without a market reference is a warning", () => {
    const f = on(S("Am Ende produzieren Sie am günstigsten.", "interpretation"));
    expect(f.some((x) => x.gate === "G7b_comparative_support" && x.severity === "warning")).toBe(true);
  });
});

describe("M17 · absolute promises (G5)", () => {
  it("'immer', 'nie', 'ausnahmslos' without a claim are blocked", () => {
    for (const t of ["Unsere Anlagen laufen immer stabil.", "Die Linie steht nie still.", "Ausnahmslos jede Charge ist rückverfolgbar."]) {
      expect(crit(S(t, "interpretation"), "G5_unsupported_assertions")).toBe(true);
    }
  });
});

describe("M17 · regulatory vocabulary (G7) and product conformity (G7c)", () => {
  it("PFAS, PPWR, MDR, FDA/GMP, CE and food contact are regulatory statements", () => {
    for (const t of ["Die PPWR gilt ab August.", "Anforderungen der MDR an Blutbeutel.", "FDA- und GMP-Anforderungen.", "CE-Kennzeichnung nach Maschinenverordnung.", "Regeln für Lebensmittelkontakt.", "PFAS-Grenzwerte.", "Verordnung (EU) 2025/40."]) {
      expect(any(S(t, "hypothesis"), "G7_regulatory_expert_review")).toBe(true);
    }
  });
  it("a conformity statement about the product needs an approved compliance claim with evidence — the law text is not proof", () => {
    const law = { regulatory: true, evidence: [{ sourceId: "src_law", excerpt: "Die Verordnung gilt ab dem 12. August 2026" }] };
    expect(crit(S("Mit der Anlage sind Ihre Verpackungen PPWR-konform.", "fact", law), "G7c_product_conformity")).toBe(true);
    expect(crit(S("Faserschalen von der Anlage sind lebensmittelecht.", "interpretation"), "G7c_product_conformity")).toBe(true);
    expect(crit(S("Unsere Schweißanlagen erfüllen die Anforderungen der MDR.", "interpretation"), "G7c_product_conformity")).toBe(true);
    expect(crit(S("Die Barriere ist PFAS-frei.", "fact", { claimIds: ["clm_pfas_unproven"] }), "G7c_product_conformity")).toBe(true);
    const ok = on(S("Die Barriere ist PFAS-frei.", "fact", { claimIds: ["clm_pfas"] }));
    expect(ok.filter((f) => f.severity === "critical")).toEqual([]);
    expect(ok.some((f) => f.gate === "G7_regulatory_expert_review")).toBe(true); // expert review still required
  });
  it("a hypothesis gets a warning; an obligation is not a conformity statement", () => {
    expect(on(S("Double-Dip ist PFAS-frei.", "hypothesis")).some((f) => f.gate === "G7c_product_conformity" && f.severity === "warning")).toBe(true);
    const law = { evidence: [{ sourceId: "src_law", excerpt: "Die Verordnung gilt ab dem 12. August 2026" }] };
    expect(any(S("Ihre Verpackungen müssen ab August die PFAS-Grenzwerte erfüllen.", "interpretation", law), "G7c_product_conformity")).toBe(false);
    expect(any(S("Verpackungshersteller brauchen PFAS-freie Barrieren für fetthaltige Lebensmittel.", "interpretation", law), "G7c_product_conformity")).toBe(false);
  });
});

describe("M17 · claim conditions (G17)", () => {
  it("a number quoted from a claim keeps 'bis zu' and the claim's conditions", () => {
    const noLimit = on(S("50 % mehr Ausstoß bei vergleichbarer Stellfläche.", "fact", { claimIds: ["clm_output"] }));
    expect(noLimit.filter((f) => f.gate === "G17_claim_conditions").map((f) => f.message)).toEqual([expect.stringContaining("without the limit")]);
    const noCond = on(S("Bis zu 50 % mehr Ausstoß.", "fact", { claimIds: ["clm_output"] }));
    expect(noCond.filter((f) => f.gate === "G17_claim_conditions").map((f) => f.message)).toEqual([expect.stringContaining("bei vergleichbarer Stellfläche")]);
    expect(on(S("Bis zu 50 % mehr Ausstoß bei vergleichbarer Stellfläche.", "fact", { claimIds: ["clm_output"] }))).toEqual([]);
  });
  it("statements that do not quote the claim's numbers are not affected", () => {
    expect(any(S("Mehr Ausstoß pro Quadratmeter.", "fact", { claimIds: ["clm_output"] }), "G17_claim_conditions")).toBe(false);
  });
});
