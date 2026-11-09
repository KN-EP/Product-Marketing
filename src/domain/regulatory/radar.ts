import { z } from "zod";
import { claimsToMarkStale } from "../claims/claim-state";
import { excerptExistsInSource, type ClaimRecord } from "../knowledge/snapshot";
import { collectStatements } from "../schemas/agents";

/**
 * M16 regulatory radar. A watched regulatory item keeps its current wording in
 * a source. When a person records a change (new wording, optionally a new
 * deadline), the impact is computed here — deterministically:
 *  - claims citing the source become stale (they must be re-verified),
 *  - assets are flagged when they cite the source, an excerpt that is no
 *    longer in it, a stale claim, or mention the previous deadline.
 * The alert stays open until a reviewer resolves it, which requires that no
 * claim it made stale is still stale.
 */

export const RegulatoryChangeKind = z.enum(["deadline_shift", "scope_change", "new_guidance", "repeal", "other"]);
export type RegulatoryChangeKind = z.infer<typeof RegulatoryChangeKind>;
export const CHANGE_KIND_LABEL: Record<RegulatoryChangeKind, string> = {
  deadline_shift: "Deadline shift",
  scope_change: "Scope change",
  new_guidance: "New guidance",
  repeal: "Repeal",
  other: "Other",
};

const Id = z.string().trim().min(1).max(64);
const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date");
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), t.optional());

/** Strict: unknown keys are rejected; the watch id is resolved via tenantDb (404 on a miss). */
export const RecordChangeInput = z
  .strictObject({
    watchId: Id,
    kind: RegulatoryChangeKind,
    summary: z.string().trim().min(10).max(1000),
    newDeadline: optional(IsoDate),
    /** The new, verified wording of the watched source (replaces the stored text). */
    updatedSourceText: z.string().trim().min(20).max(20000),
  })
  .refine((c) => c.kind !== "deadline_shift" || !!c.newDeadline, { message: "A deadline shift needs the new deadline", path: ["newDeadline"] });
export type RecordChangeInput = z.infer<typeof RecordChangeInput>;

export const ResolveChangeInput = z.strictObject({ changeId: Id, note: z.string().trim().min(10).max(1000) });

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** The ways a date is commonly written in EN and DE copy. */
export function deadlineTokens(date: Date | string | null | undefined): string[] {
  if (!date) return [];
  const iso = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const en = MONTHS_EN[m - 1]!;
  const de = MONTHS_DE[m - 1]!;
  return [...new Set([iso, `${dd}.${mm}.${y}`, `${d}.${m}.${y}`, `${d} ${en} ${y}`, `${en} ${d}, ${y}`, `${d}. ${de} ${y}`, `${en} ${y}`, `${de} ${y}`])];
}

export type ImpactReason = "cites_changed_source" | "excerpt_no_longer_in_source" | "cites_stale_claim" | "mentions_previous_deadline";
export const IMPACT_REASON_LABEL: Record<ImpactReason, string> = {
  cites_changed_source: "cites the changed source",
  excerpt_no_longer_in_source: "quotes text that is no longer in the source",
  cites_stale_claim: "relies on a claim that became stale",
  mentions_previous_deadline: "mentions the previous deadline",
};

export interface Impact {
  staleClaimIds: string[];
  affectedAssets: { assetId: string; title: string; state: string; versionId: string; reasons: ImpactReason[] }[];
}

export interface AssetForImpact {
  assetId: string;
  title: string;
  state: string;
  /** Versions to check: the current one and the latest approved one (if different). */
  versions: { versionId: string; content: unknown }[];
}

/** Impact of a change of one source (new content already known). Pure: same input → same result. */
export function analyseImpact(input: {
  sourceId: string;
  tenantId: string;
  newContent: string;
  previousDeadline: Date | string | null;
  claims: Iterable<ClaimRecord>;
  assets: readonly AssetForImpact[];
}): Impact {
  const staleClaimIds = claimsToMarkStale(input.sourceId, input.claims).map((c) => c.id);
  const stale = new Set(staleClaimIds);
  const tokens = deadlineTokens(input.previousDeadline).map((t) => t.toLowerCase());
  const newSource = { id: input.sourceId, tenantId: input.tenantId, title: "", url: null, status: "active" as const, content: input.newContent, isSynthetic: false };

  const affectedAssets: Impact["affectedAssets"] = [];
  for (const a of input.assets) {
    const reasons = new Set<ImpactReason>();
    let versionId = a.versions[0]?.versionId ?? "";
    for (const v of a.versions) {
      const before = reasons.size;
      for (const { s } of collectStatements(v.content)) {
        for (const ev of s.evidence) {
          if (ev.sourceId !== input.sourceId) continue;
          reasons.add("cites_changed_source");
          if (!excerptExistsInSource(ev.excerpt, newSource)) reasons.add("excerpt_no_longer_in_source");
        }
        if (s.claimIds.some((c) => stale.has(c))) reasons.add("cites_stale_claim");
        const text = s.text.toLowerCase();
        if (tokens.some((t) => text.includes(t))) reasons.add("mentions_previous_deadline");
      }
      if (reasons.size > before && versionId === a.versions[0]?.versionId) versionId = v.versionId;
    }
    if (reasons.size) {
      const order: ImpactReason[] = ["excerpt_no_longer_in_source", "cites_stale_claim", "mentions_previous_deadline", "cites_changed_source"];
      affectedAssets.push({ assetId: a.assetId, title: a.title, state: a.state, versionId, reasons: order.filter((r) => reasons.has(r)) });
    }
  }
  return { staleClaimIds, affectedAssets };
}

/** Briefing lines for the regulatory change agent. */
export function changeBriefNotes(c: {
  watchName: string;
  jurisdiction: string;
  topic: string;
  sourceId: string;
  kind: string;
  summary: string;
  previousDeadline: Date | null;
  newDeadline: Date | null;
  impact: Impact;
}): string {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "not set");
  return [
    `watched_item: ${c.watchName} (${c.jurisdiction}) — ${c.topic}`,
    `watched_source_id: ${c.sourceId}`,
    `change_kind: ${c.kind}`,
    `change_summary: ${c.summary}`,
    `previous_deadline: ${day(c.previousDeadline)}`,
    `new_deadline: ${day(c.newDeadline)}`,
    `stale_claims: ${c.impact.staleClaimIds.join(", ") || "none"}`,
    "affected_assets:",
    ...(c.impact.affectedAssets.length ? c.impact.affectedAssets.map((a) => `- ${a.title} [${a.state}]: ${a.reasons.join(", ")}`) : ["- none"]),
  ].join("\n");
}
