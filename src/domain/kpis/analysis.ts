import type { KpiResult, KpiStatus } from "../schemas/performance";

/**
 * Deterministic target/actual analysis (M11). The model never computes these
 * numbers: they are calculated here, stored with the performance review as
 * `kpiSnapshot` and quoted by the model only by reference (gate G10).
 */

export interface KpiInput {
  name: string;
  funnelStage: string;
  unit: KpiResult["unit"];
  direction: KpiResult["direction"];
  aggregation: KpiResult["aggregation"];
  target: number | null;
  baseline: number | null;
  /** periodStart as YYYY-MM-DD. */
  measurements: { periodStart: string; value: number }[];
}

export const PACE_THRESHOLDS = { onTrack: 95, atRisk: 75 } as const;

const DAY = 86_400_000;
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const round = (v: number | null, d: number) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Share of the campaign timeframe that has elapsed on `asOf` (inclusive), clamped to [0, 1]; null without a timeframe. */
export function elapsedShare(window: { startsOn: string | null; endsOn: string | null }, asOf: string): number | null {
  if (!window.startsOn || !window.endsOn) return null;
  const total = dayNo(window.endsOn) - dayNo(window.startsOn) + 1;
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, (dayNo(asOf) - dayNo(window.startsOn) + 1) / total));
}

function status(measurements: number, target: number | null, pacePct: number | null, direction: KpiInput["direction"], actual: number | null): KpiStatus {
  if (measurements === 0) return "no_data";
  if (target === null) return "no_target";
  if (pacePct === null) return direction === "lower_is_better" && actual === 0 ? "on_track" : "no_target";
  if (pacePct >= PACE_THRESHOLDS.onTrack) return "on_track";
  if (pacePct >= PACE_THRESHOLDS.atRisk) return "at_risk";
  return "off_track";
}

export function computeKpiResults(kpis: KpiInput[], window: { startsOn: string | null; endsOn: string | null }, asOf: string): KpiResult[] {
  const share = elapsedShare(window, asOf);
  return kpis.map((k) => {
    // Measurements inside the campaign window, up to the analysis date.
    const ms = k.measurements
      .filter((m) => m.periodStart <= asOf && (!window.startsOn || m.periodStart >= window.startsOn))
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    let actual: number | null = null;
    if (ms.length) {
      actual =
        k.aggregation === "sum"
          ? ms.reduce((s, m) => s + m.value, 0)
          : k.aggregation === "latest"
            ? ms.at(-1)!.value
            : ms.reduce((s, m) => s + m.value, 0) / ms.length;
    }
    const expected = k.target === null ? null : k.aggregation === "sum" && share !== null ? k.target * share : k.target;
    let pace: number | null = null;
    if (actual !== null && expected !== null) {
      if (k.direction === "higher_is_better") pace = expected === 0 ? null : (actual / expected) * 100;
      else pace = actual === 0 ? null : (expected / actual) * 100;
    }
    const deviation = actual !== null && k.target !== null && k.target !== 0 ? ((actual - k.target) / k.target) * 100 : null;
    const pacePct = round(pace, 1);
    return {
      name: k.name,
      funnelStage: k.funnelStage,
      unit: k.unit,
      direction: k.direction,
      aggregation: k.aggregation,
      target: round(k.target, 2),
      baseline: round(k.baseline, 2),
      actual: round(actual, 2),
      expectedToDate: round(expected, 2),
      deviationPct: round(deviation, 1),
      pacePct,
      status: status(ms.length, k.target, pacePct, k.direction, actual),
      measurements: ms.length,
    };
  });
}

/** Every number a statement may quote for these KPI results (rounded forms included). */
export function allowedNumbers(results: readonly KpiResult[], asOf?: string): number[] {
  const out = new Set<number>([0, 100]);
  const add = (v: number | null) => {
    if (v === null) return;
    for (const x of [v, Math.abs(v)]) for (const d of [0, 1, 2]) out.add(Math.round(x * 10 ** d) / 10 ** d);
  };
  for (const r of results) {
    [r.target, r.baseline, r.actual, r.expectedToDate, r.deviationPct, r.pacePct, r.measurements].forEach(add);
    if (r.target !== null && r.actual !== null) add(Math.abs(r.target - r.actual));
    for (const m of r.name.match(/\d+(?:[.,]\d+)?/g) ?? []) add(Number(m.replace(",", ".")));
  }
  if (asOf) for (const p of asOf.split("-")) add(Number(p));
  return [...out];
}

/** Possible numeric readings of a number token ("1,234.5", "1.234,5", "12,5", "41"). */
export function numberReadings(token: string): number[] {
  const out = new Set<number>();
  for (const t of [token.replace(/,/g, ""), token.replace(/\./g, "").replace(",", "."), token.replace(",", ".")]) {
    const n = Number(t);
    if (Number.isFinite(n)) out.add(n);
  }
  return [...out];
}

/** Number tokens in a text that match none of the allowed values. */
export function unknownNumbers(text: string, allowed: readonly number[]): string[] {
  const tokens = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return tokens.filter((t) => !numberReadings(t).some((n) => allowed.some((a) => Math.abs(a - n) < 1e-6)));
}
