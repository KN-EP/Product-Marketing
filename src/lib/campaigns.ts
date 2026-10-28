/** "1 approved · 2 pending review" — deliverable states of a campaign, alphabetical. */
export function deliverableSummary(states: string[]): string {
  if (states.length === 0) return "No deliverables yet";
  const counts = new Map<string, number>();
  for (const s of states) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, n]) => `${n} ${s.replace(/_/g, " ")}`)
    .join(" · ");
}

/** Common B2B channels offered as checkboxes; anything else goes into "Other channels". */
export const PRESET_CHANNELS = ["LinkedIn", "Email", "Webinar", "Sales outreach", "Events", "Website", "Paid search", "Customer success"] as const;

/** Same limit as the server-side CampaignInput. */
export { MAX_CHANNELS } from "@/domain/campaigns/campaign";

/** Preset selection + "a, b ,c" → trimmed, non-empty, case-insensitively distinct channels (first spelling wins). */
export function parseChannels(preset: readonly string[], other: string): string[] {
  const seen = new Set<string>();
  return [...preset, ...other.split(",")]
    .map((c) => c.trim())
    .filter((c) => {
      const k = c.toLowerCase();
      if (!c || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
