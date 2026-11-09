import { ASSET_SCHEMAS, collectStatements, type AssetType } from "../schemas/agents";
import { excerptExistsInSource, type KnowledgeSnapshot } from "../knowledge/snapshot";
import { allowedNumbers, unknownNumbers } from "../kpis/analysis";
import type { KpiResult } from "../schemas/performance";
import type { EnablementAsset } from "../schemas/enablement";
import { runEnablementGates } from "./enablement-gates";
import { runResearchGates } from "./research-gates";
import { runLaunchGates } from "./launch-gates";
import type { LaunchPlan } from "../schemas/launch";
import type { WinLossSynthesis } from "../schemas/research";

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
  | "G7b_comparative_support"
  // M17: product conformity needs a compliance claim about the product, not only the law text
  | "G7c_product_conformity"
  | "G10_kpi_numbers"
  // M13: product assets and sales toolkit (enablement-gates.ts)
  | "G11_number_basis"
  | "G12_customer_approval"
  | "G13_channel_limits"
  | "G14_deliverable_type"
  // M14: win/loss synthesis (research-gates.ts)
  | "G15_win_loss_numbers"
  // M15: launch plan (launch-gates.ts)
  | "G16_launch_readiness"
  // M17: a number quoted from a claim keeps its limit ("up to") and its conditions
  | "G17_claim_conditions";

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

/**
 * M17 (industrial copy, DE + EN). Found in a trial with a machine builder:
 * German comparatives ("höherer Ausstoß als …"), superlatives, "immer/nie",
 * and the regulatory vocabulary of packaging, food contact, medical and machinery.
 */
/** Comparative forms. They count as a comparison with the market only with a competitor or market reference (below). */
const COMPARATIVE_FORM = new RegExp(
  [
    // "höherer Ausstoß als X", "schnellere Taktzeiten als jeder Wettbewerber"
    "\\b(?:höher|schneller|günstiger|billiger|effizienter|zuverlässiger|stabiler|präziser|leiser|kürzer|geringer|niedriger|größer|kleiner|sparsamer|leistungsfähiger|flexibler|robuster|sicherer|produktiver|wirtschaftlicher|besser)(?:e[nmrs]?)?\\b[^.;:!?]{0,60}?\\bals\\b",
    // "mehr Ausstoß als X" — but not quantities like "mehr als 800 Mitarbeitende"
    "\\b(?:mehr|weniger)\\b(?!\\s+als\\s+\\d)[^.;:!?]{0,40}?\\bals\\b",
    "\\b(?:faster|higher|cheaper|lower|more efficient|more reliable|more productive)\\s+than\\b",
    "\\boutperform\\w*",
  ].join("|"),
  "i",
);
const SUPERLATIVE = new RegExp(
  [
    "\\b(?:niedrigst|höchst|schnellst|günstigst|billigst|effizientest|zuverlässigst|produktivst|wirtschaftlichst|größt|kleinst|präzisest|sicherst)e[nmrs]?\\b",
    "\\bbeste[nmrs]?\\b",
    "\\bam\\s+[a-zäöüß]+sten\\b",
    "\\b(?:lowest|highest|fastest|cheapest|best[- ]in[- ]class|industry[- ]leading|world[- ]leading|unmatched|unrivall?ed|branchenführend\\w*|weltweit führend\\w*)\\b",
  ].join("|"),
  "i",
);
/** What turns a comparative form or a superlative into a claim against the market. */
const COMPETITION_REFERENCE =
  /\b(?:wettbewerb\w*|konkurren\w*|mitbewerb\w*|marktbegleiter\w*|anbieter\w*|hersteller\w*|alternative\w*|herkömmlich\w*|konventionell\w*|im markt|am markt|in der branche|competitor\w*|rival\w*|vendors?|providers?|any other|other (?:solutions|machines|tools)|in the market|in the industry|conventional|traditional)\b/i;

const ABSOLUTE_PATTERN_INDUSTRY =
  /\b(?:immer(?!\s+(?:mehr|weniger|häufiger|öfter|stärker|wieder))|stets|niemals|nie|ausnahmslos|ohne ausnahme|in jedem fall|zu jeder zeit|null ausfall\w*|zero downtime|keine? (?:ausfälle|ausfall|stillstand|stillstände))\b/i;

const REGULATORY_PATTERN_INDUSTRY =
  /\b(?:pfas|ppwr|verpackungsverordnung|packaging and packaging waste|mdr|ivdr|medizinprodukte\w*|medical device regulation|fda|gmp|lebensmittelecht\w*|lebensmittelkontakt\w*|food[- ]contact|food[- ]safe|maschinenverordnung|machinery regulation|ce[- ](?:kennzeichnung|gekennzeichnet|marking|marked|konform\w*)|reach[- ](?:verordnung|regulation)|rohs|iso 13485)\b|\b(?:verordnung|regulation|richtlinie|directive)\s+\(eu\)/i;

/** M17 G7c: words that state a product property in a regulated area (conformity, approval, absence of a substance). */
const CONFORMITY_STRONG =
  /\b(?:\w+-?konform\w*|konform\w*|\w+-?tauglich\w*|tauglich\w*|compliant|zertifiziert\w*|certified|zugelassen\w*|approved for|pfas[- ]frei\w*|pfas[- ]free|lebensmittelecht\w*|food[- ]safe|ce[- ]gekennzeichnet\w*|ce[- ]marked)\b/i;
/** Weaker verbs ("erfüllt", "complies") count only when the statement is about the product or the buyer's goods. */
const CONFORMITY_WEAK = /\b(?:erfüll\w*|entspricht|entsprechen|geeignet|suitable|complies|comply|meets|fulfils|fulfills)\b/i;
const PRODUCT_REFERENCE = /\b(?:unser\w*|ihr(?:e[nmrs]?)?|your|our|mit (?:der|dem|unserer?|unserem)|macht|makes|ensures|sorgt)\b/i;
/** Statements about an obligation ("must comply") are not conformity claims. */
const OBLIGATION = /\b(?:müssen|muss|must|need to|needs to|have to|has to|sollen|soll|verpflichtet|required to)\b/i;
/** Statements about what buyers need or ask for are not conformity claims either. */
const DEMAND = /\b(?:brauch\w*|benötig\w*|such\w*|forder\w*|verlang\w*|wünsch\w*|need|needs|require|requires|demand\w*|looking for|ask for|asks for)\b/i;

function isConformityClaim(text: string): boolean {
  if (OBLIGATION.test(text) || DEMAND.test(text)) return false;
  return CONFORMITY_STRONG.test(text) || (CONFORMITY_WEAK.test(text) && PRODUCT_REFERENCE.test(text));
}

const NUMBER = /\d+(?:[.,]\d+)?/g;
const UP_TO = /\b(?:bis zu|up to)\s+(\d+(?:[.,]\d+)?)/gi;
const numbersIn = (t: string) => new Set((t.match(NUMBER) ?? []).map((n) => n.replace(",", ".")));
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const asWord = (x: string, flags: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(x)}($|[^\\p{L}\\p{N}])`, flags);

/**
 * Competitors named in the text: the full name (≥ 3 chars, any case), or its first
 * word when that is an upper-case brand or acronym ("WM" for "WM Thermoforming
 * Machines", "GABLER" for "GABLER Thermoform"), matched case-sensitively.
 */
function namedCompetitors(text: string, kb: KnowledgeSnapshot): { id: string; name: string }[] {
  const t = norm(text);
  const out: { id: string; name: string }[] = [];
  for (const c of kb.competitors.values()) {
    const n = norm(c.name);
    const first = c.name.trim().split(/\s+/)[0] ?? "";
    const full = n.length >= 3 && asWord(n, "u").test(t);
    const brand = first !== c.name.trim() && /^[A-ZÄÖÜ0-9&]{2,}$/.test(first) && asWord(first, "u").test(text);
    if (full || brand) out.push({ id: c.id, name: c.name });
  }
  return out;
}

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

  // KPI results the asset carries itself (performance reviews: server-computed,
  // never model-written). Other asset types have none, so any kpiRef fails G2.
  const snapshot = (parsed.data as { kpiSnapshot?: KpiResult[] }).kpiSnapshot ?? [];
  const kpis = new Map(snapshot.map((k) => [k.name.toLowerCase(), k] as const));
  const asOf = (parsed.data as { asOf?: string }).asOf;

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

    // ── G2 + G10: KPI references and the numbers quoted from them ──
    const refKpis: KpiResult[] = [];
    for (const name of s.kpiRefs) {
      const k = kpis.get(name.toLowerCase());
      if (!k) add("G2_references_exist", "critical", path, `Unknown KPI reference: ${name}`);
      else refKpis.push(k);
    }
    let kpiFactSupported = false;
    let kpiNumbersOk = false;
    if (refKpis.length > 0) {
      const unknown = unknownNumbers(s.text, allowedNumbers(refKpis, asOf));
      if (unknown.length) {
        add(
          "G10_kpi_numbers",
          s.kind === "fact" ? "critical" : "warning",
          path,
          `Number(s) not found in the referenced KPI results: ${unknown.slice(0, 5).join(", ")}`,
        );
      } else {
        kpiNumbersOk = true;
        kpiFactSupported = refKpis.length === s.kpiRefs.length;
      }
    }

    // ── G5: unsupported assertions ──
    // Product facts need an approved claim. Regulatory facts (statements about
    // the law, not the product) need a verified source excerpt instead. Facts
    // about measured performance need KPI references whose numbers match (G10).
    const looksRegulatory = s.regulatory || REGULATORY_PATTERN.test(s.text) || REGULATORY_PATTERN_INDUSTRY.test(s.text);
    const hasSupport = s.claimIds.length > 0 || s.evidence.length > 0 || s.kpiRefs.length > 0;
    const regulatoryFactWithEvidence = looksRegulatory && s.evidence.length > 0;
    if (s.kind === "fact" && s.claimIds.length === 0 && !regulatoryFactWithEvidence && !kpiFactSupported) {
      add("G5_unsupported_assertions", "critical", path, "Statement labelled as fact has no approved claim behind it");
    }
    // A percentage quoted from verified KPI results ("100 %") is a measurement, not a promise;
    // promise words ("guaranteed", "always") are still caught.
    const promiseText = kpiNumbersOk ? s.text.replace(/\d+(?:[.,]\d+)?\s?%/g, "") : s.text;
    if ((ABSOLUTE_PATTERN.test(promiseText) || ABSOLUTE_PATTERN_INDUSTRY.test(promiseText)) && s.claimIds.length === 0) {
      add("G5_unsupported_assertions", "critical", path, "Absolute promise without a supporting approved claim");
    }
    if (s.kind === "interpretation" && !hasSupport) {
      add("G5_unsupported_assertions", "warning", path, "Interpretation without any cited evidence");
    }

    // ── G6: separation of facts and interpretation ──
    if (s.kind !== "fact" && s.claimIds.length > 0 && s.evidence.length === 0) {
      add("G6_fact_interpretation_separation", "info", path, `${s.kind} references claims — reviewer should check it is not presented as fact`);
    }

    // M17: an approved compliance claim WITH its own evidence is proof about the product (used by G7 and G7c).
    const productProof = s.claimIds.some((id) => {
      const c = kb.claims.get(id);
      return !!c && c.tenantId === kb.tenantId && c.state === "approved" && c.category === "compliance" && c.evidence.length > 0;
    });

    // ── G7: regulatory / legal — detected independently of model labels ──
    if (looksRegulatory) {
      add("G7_regulatory_expert_review", "warning", path, "Regulatory or legal assertion — requires expert validation");
      if (!s.regulatory) {
        add("G7_regulatory_expert_review", "warning", path, "Model did not label this statement as regulatory");
      }
      if (s.kind === "fact" && s.evidence.length === 0 && !productProof) {
        add("G7_regulatory_expert_review", "critical", path, "Regulatory fact without a cited source excerpt");
      }
    }

    // ── G7c (M17): a conformity statement about the product needs a compliance claim about the product ──
    // A verified excerpt of the law shows what the law says, not that the product meets it.
    if (looksRegulatory && isConformityClaim(s.text)) {
      if (!productProof) {
        add(
          "G7c_product_conformity",
          s.kind === "fact" || s.kind === "interpretation" ? "critical" : "warning",
          path,
          "Conformity statement about the product without an approved compliance claim for the product (the law text alone is not proof)",
        );
      }
    }

    // ── G7b: comparative assertions need approved competitor evidence ──
    // M17: "-er als"/"than" and superlatives are comparisons when they name a competitor or the market.
    const named = namedCompetitors(s.text, kb);
    const superlative = SUPERLATIVE.test(s.text);
    const againstMarket = (COMPARATIVE_FORM.test(s.text) || superlative) && (named.length > 0 || COMPETITION_REFERENCE.test(s.text));
    const looksComparative = s.comparative || COMPARATIVE_PATTERN.test(s.text) || againstMarket;
    if (looksComparative && s.competitorEvidenceIds.length === 0) {
      add("G7b_comparative_support", "critical", path, "Comparative assertion without approved competitor evidence");
    } else if (looksComparative) {
      // M17: a comparison that names a competitor needs approved evidence about THAT competitor.
      for (const c of named) {
        const covered = s.competitorEvidenceIds.some((id) => {
          const ce = kb.competitorEvidence.get(id);
          return !!ce && ce.tenantId === kb.tenantId && ce.competitorId === c.id && ce.state === "approved";
        });
        if (!covered) add("G7b_comparative_support", "critical", path, `Comparison names ${c.name} but cites no approved evidence about ${c.name}`);
      }
    }
    if (superlative && !looksComparative && s.kind !== "hypothesis") {
      add("G7b_comparative_support", "warning", path, "Superlative without a comparison basis — rephrase or cite competitor evidence");
    }

    // ── G17 (M17): a number quoted from a claim keeps its limit and its conditions ──
    const quoted = numbersIn(s.text);
    for (const claimId of s.claimIds) {
      const claim = kb.claims.get(claimId);
      if (!claim || claim.tenantId !== kb.tenantId || quoted.size === 0) continue;
      const claimNumbers = numbersIn(claim.text);
      const shared = [...quoted].filter((n) => claimNumbers.has(n));
      if (shared.length === 0) continue;
      const keptUpTo = new Set([...s.text.matchAll(UP_TO)].map((m) => m[1]!.replace(",", ".")));
      for (const m of claim.text.matchAll(UP_TO)) {
        const n = m[1]!.replace(",", ".");
        if (quoted.has(n) && !keptUpTo.has(n)) {
          add("G17_claim_conditions", "critical", path, `Claim ${claimId} says "${m[0]}"; the statement quotes ${n} without the limit`);
        }
      }
      const missing = (claim.conditions ?? []).filter((c) => c.trim() && !norm(s.text).includes(norm(c)));
      if (missing.length) {
        add("G17_claim_conditions", "critical", path, `Number quoted from claim ${claimId} without its condition(s): ${missing.map((c) => `"${c}"`).join(", ")}`);
      }
    }
  }

  // ── G11–G14: M13 deliverables (numbers, customer approval, ad limits, type) ──
  runEnablementGates(assetType, parsed.data as EnablementAsset, kb, add);

  // ── G15: M14 win/loss synthesis (numbers only from the computed stats, sample size) ──
  if (assetType === "win_loss_synthesis") runResearchGates(parsed.data as WinLossSynthesis, statements, add);

  // ── G16: M15 launch plan (phases vs. computed readiness) ──
  if (assetType === "launch_plan") runLaunchGates(parsed.data as LaunchPlan, add);

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
