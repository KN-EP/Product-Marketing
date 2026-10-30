const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

/** Deterministic (server and client render the same text): UTC, en-GB. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return `${DATE_FMT.format(new Date(d))} UTC`;
}

export function fmtUsd(v: number | string | { toString(): string } | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v.toString());
  return Number.isFinite(n) ? `$${n.toFixed(4)}` : "—";
}

export const ASSET_TYPE_LABEL: Record<string, string> = {
  product_intelligence_brief: "Product intelligence brief",
  messaging_framework: "Messaging framework",
  competitive_battlecard: "Competitive battlecard",
  regulatory_gtm_brief: "Regulatory GTM brief",
  campaign_plan: "Campaign plan",
  content_matrix: "Content matrix",
  sales_play: "Sales play",
  performance_review: "Performance review",
  use_case_map: "Use case map & ICP",
  gtm_strategy_brief: "GTM strategy brief",
  release_communication_plan: "Release communication plan",
};

export const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  demand_generation: "Demand generation",
  conversion: "Conversion",
  retention: "Retention",
  loyalty: "Loyalty",
  sales_enablement: "Sales enablement",
};

export const RUN_KIND_LABEL: Record<string, string> = {
  pmm_three_asset: "PMM core (3 deliverables)",
  campaign_gtm: "Campaign package (3 deliverables)",
  campaign_performance: "Performance review (KPI analysis)",
  use_case_definition: "Use cases & ICP",
  campaign_strategy: "GTM strategy brief",
  release_communication: "Release communication plan",
};

/** Calendar date (UTC) for date-only fields such as campaign start/end. */
export function fmtDay(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

export function fmtEur(v: number | string | { toString(): string } | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v.toString());
  return Number.isFinite(n) ? `€${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : "—";
}
