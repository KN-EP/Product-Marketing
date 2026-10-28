import { z } from "zod";
import { CampaignType, type PlayType } from "../schemas/campaign";

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

/** Strict: unknown keys (e.g. a tenantId) are rejected. Product and persona ids are resolved via tenantDb (404 on miss). */
export const CampaignInput = z
  .strictObject({
    name: z.string().trim().min(3).max(120),
    type: CampaignType,
    objective: z.string().trim().min(10).max(1000),
    productId: Id,
    personaId: Id,
    market: z.string().trim().min(2).max(120),
    channels: z
      .array(z.string().trim().min(2).max(40))
      .min(1)
      .max(MAX_CHANNELS)
      .refine((cs) => new Set(cs.map((c) => c.toLowerCase())).size === cs.length, "Channels must be distinct"),
    startsOn: optional(IsoDate),
    endsOn: optional(IsoDate),
    budgetEur: optional(z.coerce.number().finite().min(0).max(10_000_000)),
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.endsOn >= c.startsOn, { message: "End date must not be before the start date", path: ["endsOn"] });
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
  channels: string[];
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
    `channels: ${c.channels.join(", ")}`,
    `timeframe: ${from || to ? `${from ?? "open"} to ${to ?? "open"}` : "not set"}`,
    `budget_eur: ${c.budgetEur === null ? "not set" : c.budgetEur.toFixed(2)}`,
    `requested_play_type: ${playTypeFor(c.type)}`,
  ].join("\n");
}
