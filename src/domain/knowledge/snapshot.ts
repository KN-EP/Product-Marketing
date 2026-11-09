/**
 * A tenant-scoped, read-only view of the knowledge base. The server builds it
 * through the tenant-scoped data-access layer; gates and agents only ever see
 * this snapshot, never the database directly.
 */
export type ClaimState = "draft" | "pending_review" | "approved" | "rejected" | "stale";
export type SourceStatus = "active" | "changed" | "invalid";

export interface SourceRecord {
  id: string;
  tenantId: string;
  title: string;
  url: string | null;
  status: SourceStatus;
  content: string;
  isSynthetic: boolean;
}

export interface ClaimEvidenceRecord {
  sourceId: string;
  excerpt: string;
  locator?: string | null;
}

export type ClaimCategory =
  | "product_capability"
  | "compliance"
  | "security"
  | "comparative"
  | "commercial"
  | "regulatory";

export interface ClaimRecord {
  id: string;
  tenantId: string;
  text: string;
  category: ClaimCategory;
  state: ClaimState;
  evidence: ClaimEvidenceRecord[];
  isSynthetic: boolean;
  /**
   * M17: conditions a number in the claim only holds under (e.g. "bei vergleichbarer
   * Stellfläche"). A statement that quotes a number of the claim must carry them (gate G17).
   */
  conditions?: string[];
}

export interface CompetitorEvidenceRecord {
  id: string;
  tenantId: string;
  competitorId: string;
  sourceId: string;
  assertion: string;
  excerpt: string;
  state: ClaimState;
}

/** M17: competitor names, so a comparison that names a competitor can be checked against evidence about it (G7b). */
export interface CompetitorRecord {
  id: string;
  tenantId: string;
  name: string;
}

export interface KnowledgeSnapshot {
  tenantId: string;
  sources: ReadonlyMap<string, SourceRecord>;
  claims: ReadonlyMap<string, ClaimRecord>;
  competitorEvidence: ReadonlyMap<string, CompetitorEvidenceRecord>;
  competitors: ReadonlyMap<string, CompetitorRecord>;
}

export function buildSnapshot(input: {
  tenantId: string;
  sources: SourceRecord[];
  claims: ClaimRecord[];
  competitorEvidence?: CompetitorEvidenceRecord[];
  competitors?: CompetitorRecord[];
}): KnowledgeSnapshot {
  // Defense in depth: drop anything not owned by the tenant, even if a caller
  // passed it in by mistake.
  const own = <T extends { tenantId: string; id: string }>(xs: T[]) =>
    new Map(xs.filter((x) => x.tenantId === input.tenantId).map((x) => [x.id, x] as const));
  return {
    tenantId: input.tenantId,
    sources: own(input.sources),
    claims: own(input.claims),
    competitorEvidence: own(input.competitorEvidence ?? []),
    competitors: own(input.competitors ?? []),
  };
}

/** Whitespace-, quote- and case-normalised text used for excerpt checks. */
export function normaliseText(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Minimum excerpt length — prevents trivially short "matches" like "AI". */
export const MIN_EXCERPT_CHARS = 12;

export function excerptExistsInSource(excerpt: string, source: SourceRecord): boolean {
  const e = normaliseText(excerpt);
  return e.length >= MIN_EXCERPT_CHARS && normaliseText(source.content).includes(e);
}
