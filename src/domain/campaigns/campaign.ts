import { z } from "zod";
import { CampaignType, type PlayType } from "../schemas/campaign";
import { SALES_CHANNEL_LABEL, SalesChannel } from "../schemas/channels";

/**
 * Campaign briefing (M8): entered by a human editor, stored as a Campaign
 * record and turned into the campaign package by the campaign_gtm run. The
 * briefing is human input — it is passed to agents as untrusted data, never
 * as evidence.
 */

const Id = z.string().trim().min(1).max(64);
const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date");
/** Empty form fields arrive as "" — treat them as "not set". */
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), t.optional());

export const MAX_CHANNELS = 8;

/** Free-text communication channels, case-insensitively distinct. */
export const CommunicationChannels = z
  .array(z.string().trim().min(2).max(40))
  .max(MAX_CHANNELS)
  .refine((cs) => new Set(cs.map((c) => c.toLowerCase())).size === cs.length, "Channels must be distinct");

/** Sales channels from the fixed list, distinct. */
export const SalesChannels = z
  .array(SalesChannel)
  .max(SalesChannel.options.length)
  .refine((cs) => new Set(cs).size === cs.length, "Sales channels must be distinct");

/** Strict: unknown keys (e.g. a tenantId) are rejected. Product and persona ids are resolved via tenantDb (404 on miss). */
export const CampaignInput = z
  .strictObject({
    name: z.string().trim().min(3).max(120),
    type: CampaignType,
    objective: z.string().trim().min(10).max(1000),
    productId: Id,
    personaId: Id,
    market: z.string().trim().min(2).max(120),
    /** M12: communication channels (message) and sales channels (deal / renewal) are kept apart. */
    communicationChannels: CommunicationChannels,
    salesChannels: SalesChannels.default([]),
    startsOn: optional(IsoDate),
    endsOn: optional(IsoDate),
    budgetEur: optional(z.coerce.number().finite().min(0).max(10_000_000)),
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.endsOn >= c.startsOn, { message: "End date must not be before the start date", path: ["endsOn"] })
  .refine((c) => c.communicationChannels.length + c.salesChannels.length >= 1, {
    message: "Select at least one communication or sales channel",
    path: ["communicationChannels"],
  });
export type CampaignInput = z.infer<typeof CampaignInput>;

/** Which sales play agent F produces for a campaign type. */
export function playTypeFor(type: CampaignType): PlayType {
  switch (type) {
    case "retention":
      return "retention_play";
    case "loyalty":
      return "loyalty_play";
    default:
      return "outreach_sequence";
  }
}

export interface CampaignBriefing {
  name: string;
  type: CampaignType;
  objective: string;
  market: string;
  communicationChannels: string[];
  salesChannels: string[];
  startsOn: Date | string | null;
  endsOn: Date | string | null;
  budgetEur: number | null;
}

const day = (d: Date | string | null) => (d === null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/**
 * Briefing lines for the agents' <brief> block. `requested_play_type` tells
 * agent F (and the simulated provider) which play to produce.
 */
export function campaignBriefNotes(c: CampaignBriefing): string {
  const from = day(c.startsOn);
  const to = day(c.endsOn);
  return [
    `campaign: ${c.name}`,
    `campaign_type: ${c.type}`,
    `objective: ${c.objective}`,
    `communication_channels: ${c.communicationChannels.join(", ") || "none"}`,
    `sales_channels: ${c.salesChannels.length ? c.salesChannels.map(salesChannelLabel).join(", ") : "none"}`,
    `timeframe: ${from || to ? `${from ?? "open"} to ${to ?? "open"}` : "not set"}`,
    `budget_eur: ${c.budgetEur === null ? "not set" : c.budgetEur.toFixed(2)}`,
    `requested_play_type: ${playTypeFor(c.type)}`,
  ].join("\n");
}

/** "partner_reseller" → "Partners & resellers"; unknown values (older rows) pass through. */
export function salesChannelLabel(c: string): string {
  return (SALES_CHANNEL_LABEL as Record<string, string>)[c] ?? c;
}
