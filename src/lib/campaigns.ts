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

/**
 * M12: communication channels (checkbox presets + free text) and sales channels
 * (fixed list) are separate fields. "Sales outreach" and "Customer success" are
 * sales channels now, not communication channels.
 */
export { PRESET_COMMUNICATION_CHANNELS, SALES_CHANNEL_LABEL } from "@/domain/schemas/channels";

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
