/**
 * M18 installed base: triggers, score and suggested offer, hand-over deadline and
 * moves, CSV import, cost-per-part calculator, reason codes by industry profile.
 */
import { describe, expect, it } from "vitest";
import { computeCostComparison, CostComparisonInput, COST_FIELD_KEYS, type Scenario } from "@/domain/installed-base/cost";
import {
  ageInYears,
  assessUnit,
  canMove,
  FindingInput,
  handoverDueOn,
  HandoverUpdateInput,
  isOverdue,
  parseFlag,
  parseInstalled,
  parseUnitsCsv,
  SAMPLE_UNITS_CSV,
} from "@/domain/installed-base/installed-base";
import { REASONS_BY_PROFILE, reasonsOutsideProfile, REASON_CODES } from "@/domain/research/win-loss";

const TODAY = new Date("2026-11-10T09:00:00Z");
const unit = (o: Partial<Parameters<typeof assessUnit>[0]> = {}) => ({
  installedOn: "2012-03-01",
  serviceContract: true,
  sparePartOrders12m: 0,
  materialChangePlanned: false,
  regulatedApplication: false,
  lastServiceOn: "2026-05-01",
  ...o,
});

describe("assessUnit: triggers, score, suggested offer", () => {
  it("computes the age in whole years", () => {
    expect(ageInYears("2016-11-10", TODAY)).toBe(10);
    expect(ageInYears("2016-11-11", TODAY)).toBe(9);
  });
  it("an old unit with a planned material change → retrofit", () => {
    const a = assessUnit(unit({ materialChangePlanned: true }), TODAY);
    expect(a.triggers).toEqual(["age_10y", "material_change"]);
    expect(a.score).toBe(5);
    expect(a.suggestedOffer).toBe("retrofit");
  });
  it("old and worn → retrofit; very old and worn → replacement", () => {
    expect(assessUnit(unit({ sparePartOrders12m: 3 }), TODAY).suggestedOffer).toBe("retrofit");
    expect(assessUnit(unit({ installedOn: "2004-01-01", sparePartOrders12m: 5 }), TODAY).suggestedOffer).toBe("replacement");
  });
  it("no contract → service contract; nothing special → spare parts", () => {
    expect(assessUnit(unit({ installedOn: "2021-01-01", serviceContract: false }), TODAY).suggestedOffer).toBe("service_contract");
    expect(assessUnit(unit({ installedOn: "2021-01-01" }), TODAY).suggestedOffer).toBe("spare_parts");
  });
  it("no service visit for more than 12 months (or never) is a trigger", () => {
    expect(assessUnit(unit({ lastServiceOn: null }), TODAY).triggers).toContain("no_service_12m");
    expect(assessUnit(unit({ lastServiceOn: "2025-10-01" }), TODAY).triggers).toContain("no_service_12m");
    expect(assessUnit(unit({ lastServiceOn: "2026-01-01" }), TODAY).triggers).not.toContain("no_service_12m");
  });
  it("is deterministic", () => {
    const u = unit({ serviceContract: false, sparePartOrders12m: 4, regulatedApplication: true });
    expect(assessUnit(u, TODAY)).toEqual(assessUnit(u, TODAY));
  });
});

describe("hand-over: deadline and moves", () => {
  it("is due 5 days after the finding and overdue only while open", () => {
    const due = handoverDueOn(new Date("2026-11-10T16:00:00Z"));
    expect(due.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(isOverdue({ status: "open", dueOn: due }, new Date("2026-11-15T23:00:00Z"))).toBe(false);
    expect(isOverdue({ status: "open", dueOn: due }, new Date("2026-11-16T08:00:00Z"))).toBe(true);
    expect(isOverdue({ status: "contacted", dueOn: due }, new Date("2026-11-20T08:00:00Z"))).toBe(false);
  });
  it("moves forward only; closed stays closed", () => {
    expect(canMove("open", "contacted")).toBe(true);
    expect(canMove("open", "won")).toBe(false);
    expect(canMove("offered", "won")).toBe(true);
    expect(canMove("won", "lost")).toBe(false);
    expect(canMove("contacted", "open")).toBe(false);
  });
  it("lost / no decision need a reason; findings reject contact data", () => {
    expect(HandoverUpdateInput.safeParse({ handoverId: "h", status: "lost" }).success).toBe(false);
    expect(HandoverUpdateInput.safeParse({ handoverId: "h", status: "lost", reasons: ["price_value"] }).success).toBe(true);
    expect(FindingInput.safeParse({ unitId: "u", offer: "retrofit", finding: "Heizung verschlissen, Kunde plant Rezyklat." }).success).toBe(true);
    expect(FindingInput.safeParse({ unitId: "u", offer: "retrofit", finding: "Rückruf an max@kunde.de wegen Retrofit" }).success).toBe(false);
    expect(FindingInput.safeParse({ unitId: "u", offer: "retrofit", finding: "kurz" }).success).toBe(false);
  });
});

describe("installed-base CSV", () => {
  it("reads the sample (German yes/no, year as installation date)", () => {
    const r = parseUnitsCsv(SAMPLE_UNITS_CSV, TODAY);
    expect(r.rowCount).toBe(2);
    expect(r.rejected).toEqual([]);
    expect(r.accepted[0]).toMatchObject({ product: "Series A", unitRef: "A-1001", installedOn: "2011-07-01", serviceContract: false, sparePartOrders12m: 4, materialChangePlanned: true, regulatedApplication: true, lastServiceOn: "2025-03-14" });
  });
  it("accepts German headers and commas", () => {
    const csv = "Baureihe,Seriennummer,Kunde,Region,Anwendung,Baujahr,Servicevertrag\nX,1,Kunde A,DACH,Becher,2010,ja";
    expect(parseUnitsCsv(csv, TODAY).accepted).toHaveLength(1);
  });
  it("rejects rows by line and reason — never with their content", () => {
    const csv = [
      "product;unit;account;region;application;installed;service_contract;spare_part_orders_12m",
      "X;1;max@kunde.de;DACH;Becher;2010;ja;1",
      "X;2;Kunde B;DACH;Becher;2030;ja;1",
      "X;3;Kunde C;DACH;Becher;2010;vielleicht;1",
      "X;4;Kunde D;DACH;Becher;2010;ja;1,5",
      "X;5;Kunde E;DACH;Becher;2010;ja;1",
      "x;5;Kunde E;DACH;Becher;2010;ja;1",
      "X;;Kunde F;DACH;Becher;2010;ja;1",
    ].join("\n");
    const r = parseUnitsCsv(csv, TODAY);
    expect(r.accepted.map((a) => a.unitRef)).toEqual(["5"]);
    expect(r.rejected).toEqual([
      { line: 2, reason: expect.stringContaining("Contact data") },
      { line: 3, reason: expect.stringContaining("future") },
      { line: 4, reason: expect.stringContaining("yes/no") },
      { line: 5, reason: expect.stringContaining("whole number") },
      { line: 7, reason: "Duplicate unit in this file" },
      { line: 8, reason: "A required field is empty" },
    ]);
    expect(JSON.stringify(r.rejected)).not.toContain("kunde.de");
  });
  it("requires the core columns", () => {
    expect(() => parseUnitsCsv("product;unit\nX;1", TODAY)).toThrow(/missing/);
  });
  it("flag and date helpers", () => {
    expect([parseFlag("Ja"), parseFlag("no"), parseFlag(""), parseFlag("vielleicht")]).toEqual([true, false, false, null]);
    expect([parseInstalled("2011"), parseInstalled("14.03.2011"), parseInstalled("2011-13-01")]).toEqual(["2011-07-01", "2011-03-14", null]);
  });
});

const sc = (kind: Scenario["kind"], v: Partial<Record<(typeof COST_FIELD_KEYS)[number], number>>, basis: Scenario["values"]["oeePercent"]["basis"] = "measured"): Scenario => {
  const d: Record<string, number> = {
    investmentEur: 0, depreciationYears: 10, partsPerHour: 10_000, hoursPerYear: 6000, oeePercent: 75, scrapPercent: 4,
    energyKwhPerHour: 120, energyPriceEurPerKwh: 0.2, materialCostPerPartEur: 0.01, labourCostPerHourEur: 60, maintenanceEurPerYear: 60_000, ...v,
  };
  return { kind, values: Object.fromEntries(COST_FIELD_KEYS.map((k) => [k, { value: d[k]!, basis }])) as Scenario["values"] };
};

describe("cost-per-part calculator", () => {
  it("computes cost per good part, savings and payback in code", () => {
    const r = computeCostComparison([
      sc("as_is", {}),
      sc("retrofit", { investmentEur: 400_000, oeePercent: 82, scrapPercent: 2.5, energyKwhPerHour: 95, maintenanceEurPerYear: 35_000 }),
    ]);
    const [base, retro] = r.scenarios;
    // as is: produced 45,000,000; good 43,200,000; cost 60,000 + 144,000 + 360,000 + 450,000 = 1,014,000
    expect(base).toMatchObject({ goodPartsPerYear: 43_200_000, annualCostEur: 1_014_000, costPerGoodPartEur: 0.0235, deltaCostPerPartPercent: null, paybackYears: null });
    // retrofit: produced 49,200,000; good 47,970,000; operating 35,000 + 114,000 + 360,000 + 492,000 = 1,001,000; + 40,000 depreciation
    expect(retro).toMatchObject({ goodPartsPerYear: 47_970_000, annualCostEur: 1_041_000, costPerGoodPartEur: 0.0217, operatingCostPerGoodPartEur: 0.0209 });
    // −7.5 % per good part; operating savings (1,014,000/43.2M − 1,001,000/47.97M) × 47.97M ≈ 124,962 €/year → 3.2 years
    expect(retro!.deltaCostPerPartPercent).toBe(-7.5);
    expect(retro!.annualOperatingSavingsEur).toBe(124_962);
    expect(retro!.paybackYears).toBe(3.2);
    expect(r.status).toBe("measured");
  });
  it("says when the result rests on assumptions", () => {
    const r = computeCostComparison([sc("as_is", {}), sc("new_machine", { investmentEur: 1_500_000, partsPerHour: 15_000 }, "illustrative")]);
    expect(r.status).toBe("contains_assumptions");
    expect(r.assumptions.filter((a) => a.scenario === "new_machine")).toHaveLength(COST_FIELD_KEYS.length);
  });
  it("no payback when the scenario does not save operating cost", () => {
    const r = computeCostComparison([sc("as_is", {}), sc("retrofit", { investmentEur: 100_000, maintenanceEurPerYear: 90_000 })]);
    expect(r.scenarios[1]!.paybackYears).toBeNull();
  });
  it("input: as-is first, kinds unique, values in range", () => {
    const ok = { productId: "p", title: "SPEEDFORMER retrofit", scenarios: [sc("as_is", {}), sc("retrofit", {})] };
    expect(CostComparisonInput.safeParse(ok).success).toBe(true);
    expect(CostComparisonInput.safeParse({ ...ok, scenarios: [sc("retrofit", {}), sc("as_is", {})] }).success).toBe(false);
    expect(CostComparisonInput.safeParse({ ...ok, scenarios: [sc("as_is", {}), sc("as_is", {})] }).success).toBe(false);
    expect(CostComparisonInput.safeParse({ ...ok, scenarios: [sc("as_is", { oeePercent: 120 }), sc("retrofit", {})] }).success).toBe(false);
    expect(CostComparisonInput.safeParse({ ...ok, tenantId: "x" }).success).toBe(false);
  });
});

describe("reason codes by industry profile", () => {
  it("every code belongs to at least one profile; profiles differ", () => {
    const all = new Set([...REASONS_BY_PROFILE.software, ...REASONS_BY_PROFILE.machinery]);
    expect([...all].sort()).toEqual([...REASON_CODES].sort());
    expect(reasonsOutsideProfile("software", ["trial_result", "price_value"])).toEqual(["trial_result"]);
    expect(reasonsOutsideProfile("machinery", ["time_to_audit", "third_party_retrofit"])).toEqual(["time_to_audit"]);
  });
});
