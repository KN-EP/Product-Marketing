/**
 * DataGuard Demo – Unofficial: SYNTHETIC demonstration data.
 *
 * Nothing in this file describes real DataGuard features, customers,
 * certifications or competitors. No URLs, quotes or citations are fabricated:
 * every source has url = null and isSynthetic = true. Before any real use,
 * replace these records with verified public sources and exact excerpts.
 */
import type { ClaimRecord, CompetitorEvidenceRecord, SourceRecord } from "../domain/knowledge/snapshot";

export const DEMO_TENANT_ID = "tnt_dataguard_demo";
export const DEMO_TENANT_NAME = "DataGuard Demo – Unofficial";
export const OTHER_TENANT_ID = "tnt_other_demo";

export const DEMO_SOURCES: SourceRecord[] = [
  {
    id: "src_demo_product_overview",
    tenantId: DEMO_TENANT_ID,
    title: "[SYNTHETIC] AI Governance module — product overview (demo)",
    url: null,
    status: "active",
    isSynthetic: true,
    content:
      "SYNTHETIC DEMO SOURCE. The AI Governance module maintains a central register of AI systems used across the organisation. " +
      "Each registered AI system can be assigned a risk category and a responsible owner. " +
      "The module generates a documentation pack per AI system that compliance teams can review and export.",
  },
  {
    id: "src_demo_security_note",
    tenantId: DEMO_TENANT_ID,
    title: "[SYNTHETIC] Security & hosting note (demo)",
    url: null,
    status: "active",
    isSynthetic: true,
    content:
      "SYNTHETIC DEMO SOURCE. Workflow approvals in the module are recorded with reviewer identity and timestamp. " +
      "Role-based access controls restrict who can edit an AI system record.",
  },
  {
    id: "src_demo_regulatory_summary",
    tenantId: DEMO_TENANT_ID,
    title: "[SYNTHETIC] Internal summary of the EU AI Act — replace with verified excerpts of Regulation (EU) 2024/1689",
    url: null,
    status: "active",
    isSynthetic: true,
    content:
      "SYNTHETIC SUMMARY FOR DEMONSTRATION, NOT LEGAL TEXT. The EU AI Act establishes a risk-based approach to AI systems. " +
      "Obligations differ depending on the risk classification of an AI system and the role of the organisation. " +
      "Organisations will need an overview of which AI systems they use in order to assess their obligations.",
  },
  {
    id: "src_demo_competitor_a",
    tenantId: DEMO_TENANT_ID,
    title: "[SYNTHETIC] Competitor A — public positioning notes (placeholder)",
    url: null,
    status: "active",
    isSynthetic: true,
    content:
      "SYNTHETIC DEMO SOURCE. Competitor A positions itself primarily around privacy management for data protection officers. " +
      "Competitor A's material does not describe a dedicated register for AI systems.",
  },
  {
    id: "src_demo_competitor_b",
    tenantId: DEMO_TENANT_ID,
    title: "[SYNTHETIC] Competitor B — public positioning notes (placeholder)",
    url: null,
    status: "active",
    isSynthetic: true,
    content: "SYNTHETIC DEMO SOURCE. Competitor B positions itself as a general GRC platform for large enterprises.",
  },
  {
    id: "src_demo_competitor_c",
    tenantId: DEMO_TENANT_ID,
    title: "[SYNTHETIC] Competitor C — public positioning notes (placeholder)",
    url: null,
    status: "active",
    isSynthetic: true,
    content: "SYNTHETIC DEMO SOURCE. Competitor C positions itself as a specialist tool for model risk management in banking.",
  },
];

const ev = (sourceId: string, excerpt: string) => ({ sourceId, excerpt });

export const DEMO_CLAIMS: ClaimRecord[] = [
  {
    id: "clm_register",
    tenantId: DEMO_TENANT_ID,
    category: "product_capability",
    state: "approved",
    isSynthetic: true,
    text: "[SYNTHETIC] The module maintains a central register of AI systems.",
    evidence: [ev("src_demo_product_overview", "maintains a central register of AI systems used across the organisation")],
  },
  {
    id: "clm_risk_owner",
    tenantId: DEMO_TENANT_ID,
    category: "product_capability",
    state: "approved",
    isSynthetic: true,
    text: "[SYNTHETIC] Each AI system can be assigned a risk category and a responsible owner.",
    evidence: [ev("src_demo_product_overview", "can be assigned a risk category and a responsible owner")],
  },
  {
    id: "clm_doc_pack",
    tenantId: DEMO_TENANT_ID,
    category: "compliance",
    state: "approved",
    isSynthetic: true,
    text: "[SYNTHETIC] The module generates an exportable documentation pack per AI system.",
    evidence: [ev("src_demo_product_overview", "generates a documentation pack per AI system that compliance teams can review and export")],
  },
  {
    id: "clm_audit_trail",
    tenantId: DEMO_TENANT_ID,
    category: "security",
    state: "approved",
    isSynthetic: true,
    text: "[SYNTHETIC] Approvals are recorded with reviewer identity and timestamp.",
    evidence: [ev("src_demo_security_note", "approvals in the module are recorded with reviewer identity and timestamp")],
  },
  {
    // Deliberately NOT approved: used to demonstrate that gates block it.
    id: "clm_automated_classification",
    tenantId: DEMO_TENANT_ID,
    category: "product_capability",
    state: "pending_review",
    isSynthetic: true,
    text: "[SYNTHETIC] The module automatically classifies AI systems under the EU AI Act.",
    evidence: [],
  },
];

export const DEMO_COMPETITOR_EVIDENCE: CompetitorEvidenceRecord[] = [
  {
    id: "cev_a_no_register",
    tenantId: DEMO_TENANT_ID,
    competitorId: "cmp_a",
    sourceId: "src_demo_competitor_a",
    assertion: "[SYNTHETIC] Competitor A's public material does not describe a dedicated AI system register.",
    excerpt: "does not describe a dedicated register for AI systems",
    state: "approved",
  },
];

/** A record owned by a different tenant — used to prove isolation. */
export const FOREIGN_CLAIM: ClaimRecord = {
  id: "clm_foreign",
  tenantId: OTHER_TENANT_ID,
  category: "product_capability",
  state: "approved",
  isSynthetic: true,
  text: "Foreign tenant claim",
  evidence: [],
};

// ─────────────── Simulated (deterministic) agent outputs ───────────────

const S = (
  text: string,
  kind: "fact" | "interpretation" | "hypothesis" | "suggestion",
  extra: Partial<{ claimIds: string[]; evidence: { sourceId: string; excerpt: string }[]; competitorEvidenceIds: string[]; regulatory: boolean; comparative: boolean }> = {},
) => ({ text, kind, claimIds: [], evidence: [], competitorEvidenceIds: [], regulatory: false, comparative: false, ...extra });

/** Agent A (simulated). Only states what approved claims support; lists the gaps. */
export const SIMULATED_PRODUCT_INTELLIGENCE_BRIEF = {
  schemaVersion: "product_intelligence_brief.v1",
  summary: S(
    "The module maintains a central register of AI systems; each system can be assigned a risk category and a responsible owner, and an exportable documentation pack is generated per system.",
    "fact",
    { claimIds: ["clm_register", "clm_risk_owner", "clm_doc_pack"] },
  ),
  buyerProblems: [
    S("Organisations first need an overview of the AI systems they use before they can assess their obligations.", "interpretation", {
      regulatory: true,
      evidence: [ev("src_demo_regulatory_summary", "need an overview of which AI systems they use in order to assess their obligations")],
    }),
    S("Ownership of individual AI systems is often unclear, which makes reviews hard to assign.", "hypothesis"),
  ],
  possibleDifferentiation: [
    S("Recorded reviewer identity and timestamps could anchor an audit-trail message.", "suggestion", { claimIds: ["clm_audit_trail"] }),
  ],
  missingEvidence: [
    "No approved claim supports automated risk classification (clm_automated_classification is pending review) — do not state it.",
    "No source documents available hosting regions.",
  ],
  questionsForProductExperts: [
    "Does the module support automated risk classification, and if so, under which conditions?",
    "Which hosting regions are available?",
    "Can the documentation pack be customised per customer?",
  ],
};

export const SIMULATED_MESSAGING_FRAMEWORK = {
  schemaVersion: "messaging_framework.v1",
  positioningStatement: S(
    "For CISOs in German mid-sized companies preparing for the EU AI Act, the AI Governance module gives a single, owned overview of every AI system in use.",
    "suggestion",
  ),
  valueProposition: S(
    "Know which AI systems you run, who owns them and what risk they carry — and hand compliance a reviewable documentation pack.",
    "suggestion",
    { claimIds: ["clm_register", "clm_risk_owner", "clm_doc_pack"] },
  ),
  pillars: [
    {
      title: "Visibility",
      message: S("Replace spreadsheet inventories with one register of AI systems.", "suggestion"),
      proofPoints: [S("The module maintains a central register of AI systems.", "fact", { claimIds: ["clm_register"] })],
    },
    {
      title: "Accountability",
      message: S("Every AI system has a named owner and a risk category.", "suggestion"),
      proofPoints: [
        S("Each AI system can be assigned a risk category and a responsible owner.", "fact", { claimIds: ["clm_risk_owner"] }),
        S("Approvals are recorded with reviewer identity and timestamp.", "fact", { claimIds: ["clm_audit_trail"] }),
      ],
    },
    {
      title: "Audit readiness",
      message: S("Give compliance teams something concrete to review.", "suggestion"),
      proofPoints: [S("The module generates an exportable documentation pack per AI system.", "fact", { claimIds: ["clm_doc_pack"] })],
    },
  ],
  objections: [
    {
      objection: "We already track AI tools in a spreadsheet.",
      response: S("A spreadsheet rarely records ownership and review history; a register with approvals does.", "interpretation", {
        claimIds: ["clm_audit_trail"],
        evidence: [ev("src_demo_security_note", "approvals in the module are recorded with reviewer identity and timestamp")],
      }),
    },
  ],
  unansweredQuestions: [
    "Does the product support automated risk classification? (claim pending review — do not use)",
    "Which hosting regions are available?",
  ],
  risksAndCaveats: [
    "All product statements are synthetic demo data and must be replaced with verified facts.",
    "Messaging must not imply that the product makes a customer compliant with the EU AI Act.",
  ],
};

export const SIMULATED_REGULATORY_BRIEF = {
  schemaVersion: "regulatory_gtm_brief.v1",
  regulatoryContext: S(
    "The EU AI Act takes a risk-based approach; obligations depend on an AI system's risk classification and the organisation's role.",
    "fact",
    {
      regulatory: true,
      claimIds: [],
      evidence: [
        ev("src_demo_regulatory_summary", "establishes a risk-based approach to AI systems"),
        ev("src_demo_regulatory_summary", "Obligations differ depending on the risk classification of an AI system and the role of the organisation"),
      ],
    },
  ),
  buyerImplications: [
    S("CISOs will likely be asked for an overview of AI systems in use before obligations can be assessed.", "interpretation", {
      regulatory: true,
      evidence: [ev("src_demo_regulatory_summary", "need an overview of which AI systems they use in order to assess their obligations")],
    }),
  ],
  messagingImplications: [S("Lead with inventory and ownership, not with compliance outcomes.", "suggestion")],
  salesDiscoveryQuestions: [
    "How do you currently find out which AI tools teams are using?",
    "Who owns the decision whether a new AI use case may go live?",
    "What would your auditor or works council ask for first?",
  ],
  plays: [{ name: "AI inventory workshop", description: S("Offer a 60-minute session to map current AI use cases.", "suggestion") }],
  doNotSay: ["'Makes you AI-Act compliant'", "Any statement on fines or deadlines without legal review"],
  expertValidationRequired: ["Regulatory context paragraph", "All buyer implications"],
  approvalChecklist: ["Legal/regulatory expert reviewed regulatory statements", "No compliance guarantees", "Synthetic sources replaced before external use"],
};

/** v1 battlecard: contains an unsupported comparative claim and a non-approved claim → must fail gates. */
export const SIMULATED_BATTLECARD_FLAWED = {
  schemaVersion: "competitive_battlecard.v1",
  competitors: [
    {
      competitorId: "cmp_a",
      name: "Competitor A (placeholder)",
      theirPositioning: S("Positions primarily around privacy management for DPOs.", "interpretation", {
        evidence: [ev("src_demo_competitor_a", "positions itself primarily around privacy management for data protection officers")],
      }),
      whereWeWin: [
        S("We are better than Competitor A at AI governance.", "suggestion"),
        S("The module automatically classifies AI systems under the EU AI Act.", "fact", { claimIds: ["clm_automated_classification"] }),
      ],
      landmines: [],
    },
  ],
  permittedComparativeClaims: [],
  discoveryQuestions: ["Q1", "Q2", "Q3"],
  approvalChecklist: ["Comparative claims backed by approved competitor evidence"],
};

/** v2 battlecard: corrected after "changes requested". */
export const SIMULATED_BATTLECARD_CORRECTED = {
  ...SIMULATED_BATTLECARD_FLAWED,
  competitors: [
    {
      ...SIMULATED_BATTLECARD_FLAWED.competitors[0]!,
      whereWeWin: [
        S("Unlike Competitor A's public material, we can show a dedicated register of AI systems.", "fact", {
          comparative: true,
          claimIds: ["clm_register"],
          competitorEvidenceIds: ["cev_a_no_register"],
        }),
      ],
      landmines: [S("Ask how the prospect currently assigns ownership for AI systems.", "suggestion")],
    },
  ],
  permittedComparativeClaims: [
    S("Competitor A's public material does not describe a dedicated AI system register.", "fact", {
      comparative: true,
      claimIds: ["clm_register"],
      competitorEvidenceIds: ["cev_a_no_register"],
    }),
  ],
  discoveryQuestions: [
    "Where do you document which AI systems are in use today?",
    "Who signs off on new AI use cases?",
    "How would you show an auditor your AI inventory?",
  ],
};
