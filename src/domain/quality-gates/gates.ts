import { ASSET_SCHEMAS, collectStatements, type AssetType } from "../schemas/agents";
import { excerptExistsInSource, type KnowledgeSnapshot } from "../knowledge/snapshot";

/**
 * Automated quality gates. These are supporting controls: they check structure,
 * referential integrity and that cited excerpts exist in stored sources. They do
 * NOT verify that a statement is true, and must never be presented as fact
 * verification. Human review remains mandatory.
 */

export type Severity = "critical" | "warning" | "info";

export type GateId =
  | "G1_schema"
  | "G2_references_exist"
  | "G3_claims_approved"
  | "G4_excerpts_exist"
  | "G5_unsupported_assertions"
  | "G6_fact_interpretation_separation"
  | "G7_regulatory_expert_review"
  | "G7b_comparative_support";

export interface Finding {
  gate: GateId;
  severity: Severity;
  path: string;
  message: string;
}

export interface GateReport {
  gateVersion: "gates.v1";
  assetType: AssetType;
  passed: boolean; // G8: false if any critical finding
  requiresExpertReview: boolean;
  findings: Finding[];
  stats: { statements: number; byKind: Record<string, number> };
  evaluatedAt: string;
}

/** Terms that indicate regulatory/legal assertions regardless of model self-labelling. */
const REGULATORY_PATTERN =
  /\b(ai act|ki-verordnung|gdpr|dsgvo|nis-?2|dora|regulation \(eu\)|article \d+|art\.\s?\d+|compliant|compliance with|konform|legal(ly)?|rechtssicher|certif(ied|ication)|zertifiziert|annex [ivx]+|high-risk|hochrisiko|conformity assessment)\b/i;

/** Absolute promises that must never pass without a claim behind them. */
const ABSOLUTE_PATTERN =
  /\b(guarantee[sd]?|garantier\w*|100\s?%|fully compliant|vollständig konform|always|never fails|eliminates all|zero risk|kein risiko|ensures compliance)\b/i;

const COMPARATIVE_PATTERN =
  /\b(better than|unlike|compared (to|with)|only (vendor|provider|solution)|first and only|market[- ]leading|#1|besser als|im gegensatz zu|einzige[rn]?|marktführ\w*)\b/i;

export function runQualityGates(
  assetType: AssetType,
  output: unknown,
  kb: KnowledgeSnapshot,
  now: Date = new Date(),
): GateReport {
  const findings: Finding[] = [];
  const add = (gate: GateId, severity: Severity, path: string, message: string) =>
    findings.push({ gate, severity, path, message });

  // ── G1: schema ──
  const parsed = ASSET_SCHEMAS[assetType].safeParse(output);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 25)) {
      add("G1_schema", "critical", "$." + issue.path.join("."), issue.message);
    }
    return finalize(assetType, findings, [], now);
  }

  const statements = collectStatements(parsed.data);

  for (const { path, s } of statements) {
    // ── G2 + G3: claim references ──
    for (const claimId of s.claimIds) {
      const claim = kb.claims.get(claimId);
      if (!claim || claim.tenantId !== kb.tenantId) {
        // Deliberately identical message for "missing" and "other tenant":
        // never leak the existence of foreign records.
        add("G2_references_exist", "critical", path, `Unknown claim reference: ${claimId}`);
        continue;
      }
      if (claim.state === "stale") {
        add("G3_claims_approved", "critical", path, `Claim ${claimId} is stale and must be re-verified`);
      } else if (claim.state !== "approved") {
        add("G3_claims_approved", "critical", path, `Claim ${claimId} is not approved (state: ${claim.state})`);
      }
    }

    // ── G2 + G4: source references and excerpts ──
    for (const ev of s.evidence) {
      const src = kb.sources.get(ev.sourceId);
      if (!src || src.tenantId !== kb.tenantId) {
        add("G2_references_exist", "critical", path, `Unknown source reference: ${ev.sourceId}`);
        continue;
      }
      if (src.status !== "active") {
        add("G4_excerpts_exist", "critical", path, `Source ${src.id} is ${src.status}; evidence must be re-checked`);
      }
      if (!excerptExistsInSource(ev.excerpt, src)) {
        add("G4_excerpts_exist", "critical", path, `Excerpt not found in stored source ${src.id}`);
      }
      if (src.isSynthetic) {
        add("G4_excerpts_exist", "info", path, `Source ${src.id} is synthetic demo data`);
      }
    }

    // ── G2 + G7b: competitor evidence ──
    for (const ceId of s.competitorEvidenceIds) {
      const ce = kb.competitorEvidence.get(ceId);
      if (!ce || ce.tenantId !== kb.tenantId) {
        add("G2_references_exist", "critical", path, `Unknown competitor evidence: ${ceId}`);
      } else if (ce.state !== "approved") {
        add("G7b_comparative_support", "critical", path, `Competitor evidence ${ceId} is not approved`);
      }
    }

    // ── G5: unsupported assertions ──
    // Product facts need an approved claim. Regulatory facts (statements about
    // the law, not the product) need a verified source excerpt instead.
    const looksRegulatory = s.regulatory || REGULATORY_PATTERN.test(s.text);
    const hasSupport = s.claimIds.length > 0 || s.evidence.length > 0;
    const regulatoryFactWithEvidence = looksRegulatory && s.evidence.length > 0;
    if (s.kind === "fact" && s.claimIds.length === 0 && !regulatoryFactWithEvidence) {
      add("G5_unsupported_assertions", "critical", path, "Statement labelled as fact has no approved claim behind it");
    }
    if (ABSOLUTE_PATTERN.test(s.text) && s.claimIds.length === 0) {
      add("G5_unsupported_assertions", "critical", path, "Absolute promise without a supporting approved claim");
    }
    if (s.kind === "interpretation" && !hasSupport) {
      add("G5_unsupported_assertions", "warning", path, "Interpretation without any cited evidence");
    }

    // ── G6: separation of facts and interpretation ──
    if (s.kind !== "fact" && s.claimIds.length > 0 && s.evidence.length === 0) {
      add("G6_fact_interpretation_separation", "info", path, `${s.kind} references claims — reviewer should check it is not presented as fact`);
    }

    // ── G7: regulatory / legal — detected independently of model labels ──
    if (looksRegulatory) {
      add("G7_regulatory_expert_review", "warning", path, "Regulatory or legal assertion — requires expert validation");
      if (!s.regulatory) {
        add("G7_regulatory_expert_review", "warning", path, "Model did not label this statement as regulatory");
      }
      if (s.kind === "fact" && s.evidence.length === 0) {
        add("G7_regulatory_expert_review", "critical", path, "Regulatory fact without a cited source excerpt");
      }
    }

    // ── G7b: comparative assertions need approved competitor evidence ──
    const looksComparative = s.comparative || COMPARATIVE_PATTERN.test(s.text);
    if (looksComparative && s.competitorEvidenceIds.length === 0) {
      add("G7b_comparative_support", "critical", path, "Comparative assertion without approved competitor evidence");
    }
  }

  return finalize(assetType, findings, statements.map((x) => x.s.kind), now);
}

function finalize(assetType: AssetType, findings: Finding[], kinds: string[], now: Date): GateReport {
  const byKind: Record<string, number> = {};
  for (const k of kinds) byKind[k] = (byKind[k] ?? 0) + 1;
  return {
    gateVersion: "gates.v1",
    assetType,
    passed: !findings.some((f) => f.severity === "critical"),
    requiresExpertReview: findings.some((f) => f.gate === "G7_regulatory_expert_review"),
    findings,
    stats: { statements: kinds.length, byKind },
    evaluatedAt: now.toISOString(),
  };
}
