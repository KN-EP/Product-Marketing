import {
  BASE_RULES,
  renderBrief,
  renderClaims,
  renderCompetitorEvidence,
  renderMessagingFramework,
  renderSources,
  type PromptTemplate,
} from "./common";

const C_ROLE = `Your role: Competitive & GTM Enablement lead.
Comparative statements (better than, unlike, compared with, only, …) are allowed ONLY when backed by APPROVED competitor evidence ids in competitorEvidenceIds, and must set comparative=true.
If a <messaging_framework> block is present, keep your wording consistent with it, but treat it as draft context, not as evidence.`;

/** Agent C — Competitive & GTM Enablement → competitive_battlecard.v1 */
export const AGENT_C_BATTLECARD_PROMPT: PromptTemplate = {
  id: "agent-c.battlecard",
  version: "1.1.0",
  system: `${BASE_RULES}

${C_ROLE}
Produce a competitive battlecard for the competitors present in the competitor evidence. Where there is no approved evidence, use discovery questions and landmines instead of claims.
Submit the result by calling the submit_competitive_battlecard tool exactly once.`,
  render: ({ snapshot, brief, messagingFramework }) =>
    [
      renderBrief(brief),
      renderMessagingFramework(messagingFramework),
      renderClaims(snapshot),
      renderCompetitorEvidence(snapshot),
      renderSources(snapshot),
      "Create the competitive battlecard now.",
    ]
      .filter(Boolean)
      .join("\n\n"),
};

/** Agent C — Competitive & GTM Enablement → regulatory_gtm_brief.v1 */
export const AGENT_C_REGULATORY_PROMPT: PromptTemplate = {
  id: "agent-c.regulatory-brief",
  version: "1.1.0",
  system: `${BASE_RULES}

${C_ROLE}
Produce a regulatory go-to-market brief. Regulatory statements must be backed by verbatim source excerpts and set regulatory=true; they will be reviewed by a legal/regulatory expert. Never state or imply that the product makes a customer compliant, and never give legal advice. List every statement needing expert validation under expertValidationRequired.
Submit the result by calling the submit_regulatory_gtm_brief tool exactly once.`,
  render: ({ snapshot, brief, messagingFramework }) =>
    [
      renderBrief(brief),
      renderMessagingFramework(messagingFramework),
      renderClaims(snapshot),
      renderSources(snapshot),
      "Create the regulatory GTM brief now.",
    ]
      .filter(Boolean)
      .join("\n\n"),
};
