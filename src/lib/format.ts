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
};
