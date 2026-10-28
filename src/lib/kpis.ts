/** KPI value for display: unit-aware, deterministic (en-GB grouping), "—" for missing. */
export function fmtKpi(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "—";
  const n = v.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  switch (unit) {
    case "percent":
      return `${n} %`;
    case "currency_eur":
      return `€${n}`;
    default:
      return n;
  }
}

export const KPI_UNIT_LABEL: Record<string, string> = { count: "Count", percent: "Percent", currency_eur: "EUR", ratio: "Ratio" };
export const KPI_DIRECTION_LABEL: Record<string, string> = { higher_is_better: "Higher is better", lower_is_better: "Lower is better" };
export const KPI_AGGREGATION_LABEL: Record<string, string> = { sum: "Sum", latest: "Latest value", average: "Average" };

/**
 * Synthetic sample CSV for the given KPIs (demo only): up to four weekly values
 * per KPI, ending on `today` and never before the campaign start. Values fall
 * off by KPI position, so typical targets show a mix of on track / at risk /
 * off track. The UI labels it as synthetic; the import stores it like any other file.
 */
export function sampleCsv(kpis: { name: string }[], startsOn: string | null, today: string, weeks = 4): string {
  const DAY = 86_400_000;
  const end = Date.parse(`${today}T00:00:00Z`);
  const first = Math.max(end - (weeks - 1) * 7 * DAY, startsOn ? Date.parse(`${startsOn}T00:00:00Z`) : -Infinity);
  const rows = ["kpi,date,value"];
  kpis.forEach((k, i) => {
    for (let w = 0, t = first; t <= end && w < weeks; w++, t += 7 * DAY) {
      const day = new Date(t).toISOString().slice(0, 10);
      rows.push(`"${k.name.replace(/"/g, '""')}",${day},${Math.round((40 + 25 * w) / (i + 1) ** 2)}`);
    }
  });
  return rows.join("\n") + "\n";
}
