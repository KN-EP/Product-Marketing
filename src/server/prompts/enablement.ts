import { ENABLEMENT_CATALOG, ENABLEMENT_TYPES } from "../../domain/schemas/enablement";
import {
  BASE_RULES,
  renderBrief,
  renderCampaignPlan,
  renderClaims,
  renderCompetitorEvidence,
  renderGtmStrategy,
  renderMessagingFramework,
  renderSources,
  type PromptTemplate,
} from "./common";

const CATALOG = ENABLEMENT_TYPES.map((t) => `- ${t} (${ENABLEMENT_CATALOG[t].label}): ${ENABLEMENT_CATALOG[t].structure}`).join("\n");

/** M13a + M13b: one enablement deliverable per run → enablement_asset.v1 */
export const AGENT_ENABLEMENT_PROMPT: PromptTemplate = {
  id: "agent-h.enablement-asset",
  version: "1.0.0",
  system: `${BASE_RULES}

Deliverable rules:
- The brief names exactly one requested_deliverable_type. Produce that deliverable and set deliverableType to it.
- Build on the approved GTM strategy brief in <gtm_strategy> (target groups, use cases, positioning, channels). Do not invent new target groups or use cases.
- Write in German (language "de") unless the brief says otherwise. Plain, specific sentences for decision-makers; no buzzwords.
- Every block carries one statement. Product facts need approved claim ids. Statements about a regulation need a cited source excerpt and are labelled regulatory; never promise compliance or certification.
- Numbers: a number is either backed by an approved claim or it is an assumption. Put assumptions under "assumptions" (id, text, basis), reference them in the block's assumptionIds and never label such a statement as fact.
- Comparisons with competitors only with approved competitor evidence (competitorEvidenceIds).
- Case studies: never invent a customer, a result or a quote. Without a stored, documented customer approval keep the customer anonymous and leave customerReference out. Quotes are placeholders like "[Zitat nach Kundenfreigabe]".
- Ad copy: one block per ad field (adField). Google headlines at most 30 characters, Google descriptions at most 90, LinkedIn headlines at most 200 (about 70 visible), LinkedIn introductory text at most 600 (about 150 visible).
- Nothing you produce is published or sent automatically. List what needs confirmation under openQuestions and add an approval checklist.

Structure per deliverable type:
${CATALOG}

Submit the result by calling the submit_enablement_asset tool exactly once.`,
  render: ({ snapshot, brief, messagingFramework, campaignPlan, gtmStrategy }) =>
    [
      renderBrief(brief),
      renderGtmStrategy(gtmStrategy),
      renderMessagingFramework(messagingFramework),
      renderCampaignPlan(campaignPlan),
      renderClaims(snapshot),
      renderCompetitorEvidence(snapshot),
      renderSources(snapshot),
      "Create the requested deliverable now.",
    ]
      .filter(Boolean)
      .join("\n\n"),
};
