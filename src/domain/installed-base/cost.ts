import { z } from "zod";

/**
 * M18 cost-per-part calculator. A machine builder sells cost per good part over
 * the lifecycle, not a machine. The numbers are computed HERE, in code, from
 * inputs a person enters — every input carries its basis (measured, customer
 * input, benchmark to verify, illustrative). A model may quote the result; it
 * never computes it. The result says plainly whether it rests on assumptions.
 */

export const InputBasis = z.enum(["measured", "customer_input", "benchmark_to_verify", "illustrative"]);
export type InputBasis = z.infer<typeof InputBasis>;
export const BASIS_LABEL: Record<InputBasis, string> = {
  measured: "Measured",
  customer_input: "Customer input",
  benchmark_to_verify: "Benchmark — to verify",
  illustrative: "Illustrative",
};

export const COST_FIELDS = {
  investmentEur: { label: "Investment (EUR)", min: 0, max: 1e9 },
  depreciationYears: { label: "Depreciation period (years)", min: 1, max: 40 },
  partsPerHour: { label: "Output (parts per hour)", min: 1, max: 1e7 },
  hoursPerYear: { label: "Operating hours per year", min: 1, max: 8784 },
  oeePercent: { label: "OEE (%)", min: 1, max: 100 },
  scrapPercent: { label: "Scrap (%)", min: 0, max: 99 },
  energyKwhPerHour: { label: "Energy (kWh per operating hour)", min: 0, max: 1e5 },
  energyPriceEurPerKwh: { label: "Energy price (EUR per kWh)", min: 0, max: 10 },
  materialCostPerPartEur: { label: "Material per part produced (EUR)", min: 0, max: 1e4 },
  labourCostPerHourEur: { label: "Labour (EUR per operating hour)", min: 0, max: 1e4 },
  maintenanceEurPerYear: { label: "Maintenance and spare parts (EUR per year)", min: 0, max: 1e8 },
} as const;
export type CostField = keyof typeof COST_FIELDS;
export const COST_FIELD_KEYS = Object.keys(COST_FIELDS) as CostField[];

const Value = z.strictObject({ value: z.coerce.number().finite(), basis: InputBasis });
const ScenarioKind = z.enum(["as_is", "retrofit", "new_machine"]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;
export const SCENARIO_LABEL: Record<ScenarioKind, string> = { as_is: "As is", retrofit: "Retrofit", new_machine: "New machine" };

const Scenario = z
  .strictObject({ kind: ScenarioKind, values: z.strictObject(Object.fromEntries(COST_FIELD_KEYS.map((k) => [k, Value])) as Record<CostField, typeof Value>) })
  .superRefine((s, ctx) => {
    for (const k of COST_FIELD_KEYS) {
      const { min, max } = COST_FIELDS[k];
      const v = s.values[k].value;
      if (v < min || v > max) ctx.addIssue({ code: "custom", path: ["values", k], message: `${COST_FIELDS[k].label}: between ${min} and ${max}` });
    }
  });
export type Scenario = z.infer<typeof Scenario>;

/** Strict: unknown keys are rejected. "as_is" is the baseline and comes first. */
export const CostComparisonInput = z
  .strictObject({
    productId: z.string().trim().min(1).max(64),
    unitId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().min(1).max(64).optional()),
    title: z.string().trim().min(3).max(120),
    scenarios: z.array(Scenario).min(2).max(3),
  })
  .refine((c) => c.scenarios[0]!.kind === "as_is", { message: "The first scenario must be the current machine (as is)", path: ["scenarios"] })
  .refine((c) => new Set(c.scenarios.map((s) => s.kind)).size === c.scenarios.length, { message: "Each scenario kind only once", path: ["scenarios"] });
export type CostComparisonInput = z.infer<typeof CostComparisonInput>;

export interface ScenarioResult {
  kind: ScenarioKind;
  goodPartsPerYear: number;
  annualCostEur: number;
  /** incl. depreciation of the investment */
  costPerGoodPartEur: number;
  /** without depreciation: what the customer pays to run the machine */
  operatingCostPerGoodPartEur: number;
  /** vs. as is (null for the baseline) */
  deltaCostPerPartPercent: number | null;
  annualOperatingSavingsEur: number | null;
  paybackYears: number | null;
}
export interface CostResult {
  calcVersion: "cost.v1";
  scenarios: ScenarioResult[];
  /** Inputs that are not measured or customer data. */
  assumptions: { scenario: ScenarioKind; field: CostField; basis: InputBasis }[];
  /** "measured" only if every input is measured or customer input. */
  status: "measured" | "contains_assumptions";
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Deterministic: same inputs → same result. */
export function computeCostComparison(scenarios: Scenario[]): CostResult {
  const raw = scenarios.map((s) => {
    const v = Object.fromEntries(COST_FIELD_KEYS.map((k) => [k, s.values[k].value])) as Record<CostField, number>;
    const produced = v.partsPerHour * v.hoursPerYear * (v.oeePercent / 100);
    const good = produced * (1 - v.scrapPercent / 100);
    const depreciation = v.investmentEur / v.depreciationYears;
    const operating = v.maintenanceEurPerYear + v.energyKwhPerHour * v.hoursPerYear * v.energyPriceEurPerKwh + v.labourCostPerHourEur * v.hoursPerYear + v.materialCostPerPartEur * produced;
    return { kind: s.kind, good, annual: depreciation + operating, operating, investment: v.investmentEur };
  });
  const base = raw[0]!;
  const baseCpp = base.annual / base.good;
  const baseOpp = base.operating / base.good;
  const results: ScenarioResult[] = raw.map((r, i) => {
    const cpp = r.annual / r.good;
    const opp = r.operating / r.good;
    const savings = i === 0 ? null : (baseOpp - opp) * r.good;
    return {
      kind: r.kind,
      goodPartsPerYear: Math.round(r.good),
      annualCostEur: round(r.annual, 0),
      costPerGoodPartEur: round(cpp, 4),
      operatingCostPerGoodPartEur: round(opp, 4),
      deltaCostPerPartPercent: i === 0 ? null : round(((cpp - baseCpp) / baseCpp) * 100, 1),
      annualOperatingSavingsEur: savings === null ? null : round(savings, 0),
      paybackYears: savings !== null && savings > 0 && r.investment > 0 ? round(r.investment / savings, 1) : null,
    };
  });
  const assumptions = scenarios.flatMap((s) =>
    COST_FIELD_KEYS.filter((k) => s.values[k].basis === "benchmark_to_verify" || s.values[k].basis === "illustrative").map((k) => ({ scenario: s.kind, field: k, basis: s.values[k].basis })),
  );
  return { calcVersion: "cost.v1", scenarios: results, assumptions, status: assumptions.length ? "contains_assumptions" : "measured" };
}
