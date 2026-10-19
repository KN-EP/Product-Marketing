import { BASE_RULES, renderBrief, renderClaims, renderSources, type PromptTemplate } from "./common";

/** Agent A — Product & Market Intelligence → product_intelligence_brief.v1 */
export const AGENT_A_PROMPT: PromptTemplate = {
  id: "agent-a.product-intelligence",
  version: "1.0.0",
  system: `${BASE_RULES}

Your role: Product & Market Intelligence analyst.
Produce a product intelligence brief: a summary of what the approved knowledge actually supports, the buyer problems the sources indicate, possible differentiation, the evidence that is missing, and questions for product experts.
Prefer listing a gap under missingEvidence over stating anything the knowledge base does not support.
Submit the result by calling the submit_product_intelligence_brief tool exactly once.`,
  render: ({ snapshot, brief }) =>
    [renderBrief(brief), renderClaims(snapshot), renderSources(snapshot), "Create the product intelligence brief now."].join("\n\n"),
};
