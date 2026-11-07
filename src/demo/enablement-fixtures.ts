/**
 * SYNTHETIC simulated outputs of the enablement agent (M13a + M13b) for the
 * demo tenant. They only use the approved demo claims, the synthetic
 * regulatory summary and the approved demo competitor evidence, so they pass
 * the gates — except the one-pager, whose v1 deliberately quotes a number
 * without basis (gate G11). Its prepared correction marks the number as an
 * assumption. Nothing here describes a real company, customer or product.
 */
import type { EnablementType } from "../domain/schemas/enablement";

type Kind = "fact" | "interpretation" | "hypothesis" | "suggestion";
const S = (
  text: string,
  kind: Kind,
  extra: Partial<{ claimIds: string[]; evidence: { sourceId: string; excerpt: string }[]; competitorEvidenceIds: string[]; regulatory: boolean; comparative: boolean }> = {},
) => ({ text, kind, claimIds: [], evidence: [], competitorEvidenceIds: [], regulatory: false, comparative: false, ...extra });

const REG = { sourceId: "src_demo_regulatory_summary", excerpt: "need an overview of which AI systems they use in order to assess their obligations" };
const REG_RISK = { sourceId: "src_demo_regulatory_summary", excerpt: "Obligations differ depending on the risk classification of an AI system and the role of the organisation" };

const REGISTER = S("The module maintains a central register of AI systems.", "fact", { claimIds: ["clm_register"] });
const OWNER = S("Each AI system can be assigned a risk category and a responsible owner.", "fact", { claimIds: ["clm_risk_owner"] });
const DOCPACK = S("The module generates an exportable documentation pack per AI system.", "fact", { claimIds: ["clm_doc_pack"] });
const AUDIT = S("Approvals are recorded with reviewer identity and timestamp.", "fact", { claimIds: ["clm_audit_trail"] });
const OVERVIEW = S("Organisations need an overview of the AI systems they use to assess their obligations.", "interpretation", {
  regulatory: true,
  evidence: [REG],
});

type Block = { label?: string; statement: ReturnType<typeof S>; assumptionIds?: string[]; adField?: string };
const b = (label: string, statement: ReturnType<typeof S>, extra: Partial<Block> = {}): Block => ({ label, statement, assumptionIds: [], ...extra });
const sec = (heading: string, ...blocks: Block[]) => ({ heading, blocks });

const base = (type: EnablementType, title: string, audience: string, purpose: ReturnType<typeof S>, sections: ReturnType<typeof sec>[]) => ({
  schemaVersion: "enablement_asset.v1",
  deliverableType: type,
  title,
  audience,
  language: "en",
  purpose,
  sections,
  assumptions: [] as { id: string; text: string; basis: string }[],
  openQuestions: ["Which customer reference may be named once a customer has approved it?"],
  approvalChecklist: ["Every fact backed by an approved claim", "No compliance promises", "Regulatory statements checked by an expert"],
});

const FIXTURES: Record<EnablementType, unknown> = {
  product_page: base("product_page", "[SYNTHETIC] AI Governance module — product page", "CISO and compliance lead", S("Show what the module does and lead to a walkthrough.", "suggestion"), [
    sec("Hero", b("Headline", S("Know every AI system you use — and who owns it.", "suggestion", { claimIds: ["clm_register", "clm_risk_owner"] })), b("Call to action", S("Book a 30-minute walkthrough.", "suggestion"))),
    sec("How it works", b("Register", REGISTER), b("Ownership", OWNER), b("Documentation", DOCPACK)),
    sec("Why it matters", b("Context", OVERVIEW)),
  ]),
  solution_brief: base("solution_brief", "[SYNTHETIC] Solution brief: AI inventory for regulated mid-sized companies", "Compliance lead", S("A two-page brief for the first conversation.", "suggestion"), [
    sec("Situation", b("Challenge", S("AI systems spread across teams faster than an inventory can follow.", "hypothesis"))),
    sec("Solution", b("Register", REGISTER), b("Owner", OWNER)),
    sec("Proof", b("Audit trail", AUDIT)),
  ]),
  whitepaper_outline: base("whitepaper_outline", "[SYNTHETIC] Whitepaper outline: From AI sprawl to AI register", "Compliance and IT leadership", S("Outline for a whitepaper that earns the download.", "suggestion"), [
    sec("Thesis", b("Thesis", S("An AI inventory is the first step of any AI governance programme.", "interpretation", { regulatory: true, evidence: [REG] }))),
    sec("Chapter 1 — Why an inventory comes first", b("Key message", OVERVIEW)),
    sec("Chapter 2 — Ownership and risk categories", b("Key message", OWNER)),
  ]),
  thought_leadership: base("thought_leadership", "[SYNTHETIC] Thought leadership: Governance starts with knowing", "Executive readers", S("A point of view without a product pitch.", "suggestion"), [
    sec("Point of view", b("Thesis", S("Most governance gaps are visibility gaps.", "hypothesis"))),
    sec("Arguments", b("1", OVERVIEW), b("2", S("Clear ownership turns policies into decisions someone is accountable for.", "interpretation"))),
  ]),
  regulatory_explainer: base("regulatory_explainer", "[SYNTHETIC] What the EU AI Act means for your AI inventory", "Decision-makers in regulated industries", S("Explain the regulation in practical terms; no compliance promise.", "suggestion"), [
    sec("What it is about", b("Risk-based approach", S("Obligations differ depending on the risk classification of an AI system and the role of the organisation.", "fact", { regulatory: true, evidence: [REG_RISK] }))),
    sec("What it means in practice", b("First step", OVERVIEW)),
    sec("How the module helps", b("Register", REGISTER), b("Documentation", DOCPACK)),
    sec("What stays with experts", b("Expert review", S("Classifying a specific AI system remains a task for your legal and compliance experts.", "suggestion", { regulatory: true }))),
  ]),
  case_study: base("case_study", "[SYNTHETIC] Case study (anonymised): a mid-sized insurer builds its AI register", "Prospects in financial services", S("An anonymised story until a customer approves being named.", "suggestion"), [
    sec("Situation", b("Customer", S("A mid-sized insurer (anonymised) used AI systems in several departments without a common overview.", "hypothesis"))),
    sec("Solution", b("Register", REGISTER), b("Ownership", OWNER)),
    sec("Quote", b("Quote", S("[Quote after customer approval]", "suggestion"))),
  ]),
  ad_copy: base("ad_copy", "[SYNTHETIC] Ad copy: AI inventory checklist", "CISO and compliance lead", S("Two ad variants that lead to the checklist.", "suggestion"), [
    sec(
      "LinkedIn",
      b("Intro text", S("Which AI systems do your teams use? A central register shows every system and its owner.", "suggestion", { claimIds: ["clm_register", "clm_risk_owner"] }), { adField: "linkedin_intro_text" }),
      b("Headline", S("Get the AI inventory checklist", "suggestion"), { adField: "linkedin_headline" }),
    ),
    sec(
      "Google",
      b("Headline 1", S("AI inventory checklist", "suggestion"), { adField: "google_headline" }),
      b("Description", S("One register for every AI system, with owner and risk category.", "suggestion", { claimIds: ["clm_register", "clm_risk_owner"] }), { adField: "google_description" }),
    ),
  ]),
  webinar_outline: base("webinar_outline", "[SYNTHETIC] Webinar: Your first AI inventory in 45 minutes", "Compliance teams", S("A live walkthrough that ends with a next step.", "suggestion"), [
    sec("Agenda", b("10 min", OVERVIEW), b("20 min — demo", REGISTER), b("10 min — documentation", DOCPACK), b("5 min — Q&A", S("Questions from the audience.", "suggestion"))),
  ]),
  video_script: base("video_script", "[SYNTHETIC] Video script: 90 seconds AI register", "Website visitors", S("Short explainer for the product page.", "suggestion"), [
    sec("Scene 1", b("Narration", S("Your teams use AI. Do you know where?", "suggestion"))),
    sec("Scene 2", b("Narration", REGISTER), b("On screen", OWNER)),
    sec("Scene 3", b("Call to action", S("Book a walkthrough.", "suggestion"))),
  ]),
  industry_narrative: base("industry_narrative", "[SYNTHETIC] Industry narrative: financial services", "Sales and marketing", S("How to talk about the module in financial services.", "suggestion"), [
    sec("Industry situation", b("Trigger", S("Supervisory reviews raise the question which AI systems are in use.", "hypothesis"))),
    sec("What to show", b("Register", REGISTER), b("Audit trail", AUDIT)),
    sec("Avoid", b("Do not say", S("Avoid any statement that the module makes a bank compliant.", "suggestion", { regulatory: true }))),
  ]),
  pitch_deck_outline: base("pitch_deck_outline", "[SYNTHETIC] First-meeting deck", "CISO", S("Slide-by-slide outline for the first meeting.", "suggestion"), [
    sec("Slide 1 — Situation", b("Message", OVERVIEW)),
    sec("Slide 2 — Solution", b("Message", REGISTER), b("Message", OWNER)),
    sec("Slide 3 — Proof", b("Message", AUDIT)),
    sec("Slide 4 — Why us", b("Message", S("Unlike Competitor A, the module offers a dedicated register for AI systems.", "fact", { claimIds: ["clm_register"], comparative: true, competitorEvidenceIds: ["cev_a_no_register"] }))),
    sec("Slide 5 — Next step", b("Message", S("Agree on a 30-minute walkthrough with the compliance team.", "suggestion"))),
  ]),
  demo_story: base("demo_story", "[SYNTHETIC] Demo story: from spreadsheet to register", "Sales engineers", S("A demo that follows one persona's day.", "suggestion"), [
    sec("Scene 1 — The register", b("Show", REGISTER), b("Say", S("This is the one place where every AI system lives.", "suggestion"))),
    sec("Scene 2 — Ownership", b("Show", OWNER)),
    sec("Scene 3 — The aha moment", b("Show", DOCPACK)),
  ]),
  one_pager: {
    ...base("one_pager", "[SYNTHETIC] One-pager: AI register", "CISO", S("One page to leave behind after the first meeting.", "suggestion"), [
      sec("Headline", b("Headline", S("One register for every AI system.", "suggestion", { claimIds: ["clm_register"] }))),
      sec("Benefits", b("Ownership", OWNER), b("Documentation", DOCPACK), b("Time saved", S("Teams save 40 % of the time spent on AI documentation.", "fact"))),
      sec("Next step", b("Call to action", S("Book a 30-minute walkthrough.", "suggestion"))),
    ]),
  },
  discovery_guide: base("discovery_guide", "[SYNTHETIC] Discovery guide: AI governance", "Account executives", S("Questions for the first discovery call.", "suggestion"), [
    sec("Situation", b("Question 1", S("Which AI systems do your teams use today, and where is that documented?", "suggestion"))),
    sec("Pain", b("Question 2", S("Who decides today whether a new AI system may be used?", "suggestion"))),
    sec("Signals", b("Listen for", S("No single owner per AI system is a strong signal for the register.", "interpretation", { claimIds: ["clm_risk_owner"] }))),
  ]),
  persona_playbook: base("persona_playbook", "[SYNTHETIC] Persona playbook: CISO", "Sales", S("What the CISO needs to hear.", "suggestion"), [
    sec("Priorities", b("Priority", S("Overview and accountability for every AI system.", "hypothesis"))),
    sec("Proof points", b("Register", REGISTER), b("Audit trail", AUDIT)),
    sec("Objection", b("“We track this in a spreadsheet”", S("A register assigns each AI system a risk category and an owner, which a spreadsheet does not enforce.", "interpretation", { claimIds: ["clm_risk_owner"] }))),
  ]),
  roi_argument: {
    ...base("roi_argument", "[SYNTHETIC] ROI argument: documentation effort", "CFO and CISO", S("Calculation logic with every number marked as an assumption.", "suggestion"), [
      sec("Today", b("Effort", S("A team documents 25 AI systems at about 6 hours each per year.", "hypothesis"), { assumptionIds: ["A1", "A2"] })),
      sec("With the module", b("Documentation pack", DOCPACK), b("Effect", S("If the documentation pack halves the effort, the team saves about 75 hours a year.", "hypothesis"), { assumptionIds: ["A1", "A2", "A3"] })),
    ]),
    assumptions: [
      { id: "A1", text: "25 AI systems in use — replace with the customer's number", basis: "customer_input" },
      { id: "A2", text: "6 hours of documentation per AI system and year — to be verified with the customer", basis: "benchmark_to_verify" },
      { id: "A3", text: "Effort halved by the documentation pack — illustrative, not a measured result", basis: "illustrative" },
    ],
  },
  sales_training: base("sales_training", "[SYNTHETIC] Product training: AI register", "New sales colleagues", S("A one-hour training with a knowledge check.", "suggestion"), [
    sec("Module 1 — What the product does", b("Key message", REGISTER), b("Key message", OWNER)),
    sec("Module 2 — What we never say", b("Rule", S("Never promise that the module makes a customer compliant.", "suggestion", { regulatory: true }))),
    sec("Knowledge check", b("Question 1", S("What does the register record per AI system? — Answer: risk category and responsible owner.", "suggestion", { claimIds: ["clm_risk_owner"] }))),
  ]),
};

export function simulatedEnablementAsset(type: EnablementType): unknown {
  return FIXTURES[type];
}

/** One-pager v2 for the demo: the "40 %" becomes a marked, illustrative assumption instead of a fact. */
export const SIMULATED_ONE_PAGER_CORRECTED = (() => {
  const v1 = FIXTURES.one_pager as ReturnType<typeof base>;
  return {
    ...v1,
    sections: v1.sections.map((s, i) =>
      i === 1
        ? {
            ...s,
            blocks: s.blocks.map((blk) =>
              blk.label === "Time saved"
                ? { ...blk, statement: S("Teams could save time on AI documentation — to be quantified with your own numbers (example: 40 %).", "hypothesis"), assumptionIds: ["A1"] }
                : blk,
            ),
          }
        : s,
    ),
    assumptions: [{ id: "A1", text: "40 % time saved — illustrative example, not a measured result", basis: "illustrative" }],
  };
})();
