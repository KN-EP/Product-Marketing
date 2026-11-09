import { z } from "zod";
import { CommunicationChannels, SalesChannels, salesChannelLabel } from "../campaigns/campaign";
import { ReleaseAudience, ReleaseType } from "../schemas/release";

/**
 * Release briefing (M12, station "Release & update"): entered by a human
 * editor, stored as a Release record (the release plan) and turned into a
 * release communication plan by the release_communication run. Human input —
 * passed to the agent as untrusted data, never as evidence.
 */

const Id = z.string().trim().min(1).max(64);
const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date");
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), t.optional());

export const MAX_RELEASE_CHANGES = 12;

/** Strict: unknown keys (e.g. a tenantId) are rejected. The product id is resolved via tenantDb (404 on miss). */
export const ReleaseInput = z
  .strictObject({
    productId: Id,
    name: z.string().trim().min(3).max(120),
    version: z.string().trim().min(1).max(40),
    type: ReleaseType,
    plannedOn: optional(IsoDate),
    summary: z.string().trim().min(10).max(1000),
    changes: z.array(z.string().trim().min(3).max(300)).min(1).max(MAX_RELEASE_CHANGES),
    audiences: z
      .array(ReleaseAudience)
      .min(1)
      .refine((a) => new Set(a).size === a.length, "Audiences must be distinct"),
    communicationChannels: CommunicationChannels,
    salesChannels: SalesChannels.default([]),
  })
  .refine((r) => r.communicationChannels.length + r.salesChannels.length >= 1, {
    message: "Select at least one communication or sales channel",
    path: ["communicationChannels"],
  });
export type ReleaseInput = z.infer<typeof ReleaseInput>;

export const RELEASE_TYPE_LABEL: Record<ReleaseType, string> = {
  major_release: "Major release",
  feature_update: "Feature update",
  maintenance_update: "Maintenance update",
  security_update: "Security update",
  deprecation: "Deprecation / end of life",
};

export const RELEASE_AUDIENCE_LABEL: Record<ReleaseAudience, string> = {
  existing_customers: "Existing customers",
  prospects: "Prospects",
  partners_resellers: "Partners & resellers",
  internal_sales: "Sales (internal enablement)",
  internal_support: "Support & customer success (internal)",
};

export interface ReleaseBriefing {
  name: string;
  version: string;
  type: string;
  plannedOn: Date | string | null;
  summary: string;
  changes: string[];
  audiences: string[];
  communicationChannels: string[];
  salesChannels: string[];
}

const day = (d: Date | string | null) => (d === null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Briefing lines for the release agent's <brief> block. */
export function releaseBriefNotes(r: ReleaseBriefing): string {
  return [
    `release: ${r.name}`,
    `version: ${r.version}`,
    `release_type: ${r.type}`,
    `planned_on: ${day(r.plannedOn) ?? "not set"}`,
    `summary: ${r.summary}`,
    "changes:",
    ...r.changes.map((c) => `- ${c}`),
    `audiences: ${r.audiences.join(", ")}`,
    `communication_channels: ${r.communicationChannels.join(", ") || "none"}`,
    `sales_channels: ${r.salesChannels.length ? r.salesChannels.map(salesChannelLabel).join(", ") : "none"}`,
  ].join("\n");
}
