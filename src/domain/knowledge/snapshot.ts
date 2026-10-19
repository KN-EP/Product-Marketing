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

export interface KnowledgeSnapshot {
  tenantId: string;
  sources: ReadonlyMap<string, SourceRecord>;
  claims: ReadonlyMap<string, ClaimRecord>;
  competitorEvidence: ReadonlyMap<string, CompetitorEvidenceRecord>;
}

export function buildSnapshot(input: {
  tenantId: string;
  sources: SourceRecord[];
  claims: ClaimRecord[];
  competitorEvidence?: CompetitorEvidenceRecord[];
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
