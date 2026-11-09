import { z } from "zod";
import { EvidenceRef, Statement } from "./common";

/**
 * M13a + M13b: product and conversion assets and the sales toolkit.
 *
 * One schema for 17 deliverable types: every deliverable is a titled document
 * of sections and blocks, and every block carries a Statement, so the existing
 * quality gates (claims, excerpts, unsupported, absolute, regulatory and
 * comparative assertions) apply unchanged. What differs per type is the
 * structure the agent is asked for (ENABLEMENT_CATALOG.structure) and a few
 * type-specific gates (G11–G14 in src/domain/quality-gates/gates.ts).
 */

const Label = (max: number) => z.string().min(1).max(max);

/** M13a — product and conversion assets. */
export const PRODUCT_ASSET_TYPES = [
  "product_page",
  "solution_brief",
  "whitepaper_outline",
  "thought_leadership",
  "regulatory_explainer",
  "case_study",
  "ad_copy",
  "webinar_outline",
  "video_script",
  "industry_narrative",
] as const;

/** M13b — sales toolkit and training. */
export const SALES_TOOLKIT_TYPES = [
  "pitch_deck_outline",
  "demo_story",
  "one_pager",
  "discovery_guide",
  "persona_playbook",
  "roi_argument",
  "sales_training",
] as const;

export const ENABLEMENT_TYPES = [...PRODUCT_ASSET_TYPES, ...SALES_TOOLKIT_TYPES] as const;
export const EnablementType = z.enum(ENABLEMENT_TYPES);
export type EnablementType = z.infer<typeof EnablementType>;

export function isEnablementType(t: string): t is EnablementType {
  return (ENABLEMENT_TYPES as readonly string[]).includes(t);
}

/** Ad fields with platform character limits (gate G13). */
export const AdField = z.enum(["linkedin_intro_text", "linkedin_headline", "google_headline", "google_description"]);
export type AdField = z.infer<typeof AdField>;

/**
 * Hard limits block approval; recommended limits produce a warning.
 * Google responsive search ads: headline 30, description 90 characters.
 * LinkedIn single image ads: introductory text 600 (≈150 visible), headline 200 (≈70 visible).
 */
export const AD_LIMITS: Record<AdField, { hard: number; recommended?: number }> = {
  google_headline: { hard: 30 },
  google_description: { hard: 90 },
  linkedin_headline: { hard: 200, recommended: 70 },
  linkedin_intro_text: { hard: 600, recommended: 150 },
};

export const AssumptionBasis = z.enum(["customer_input", "benchmark_to_verify", "illustrative"]);

const Block = z.object({
  /** e.g. "Slide 3", "Hero", "Question 2", "Scene 1". */
  label: Label(120).optional(),
  statement: Statement,
  /** Ids from `assumptions` that the numbers in this block rest on (gate G11). */
  assumptionIds: z.array(Label(40)).max(10).default([]),
  /** ad_copy only: which ad field this block is (gate G13). */
  adField: AdField.optional(),
});

export const EnablementAssetV1 = z.object({
  schemaVersion: z.literal("enablement_asset.v1"),
  /** Must equal the asset type (gate G14). */
  deliverableType: EnablementType,
  title: Label(160),
  audience: Label(240),
  /** Prepared for M13d (localisation); the demo and the prompt default to German. */
  language: z.enum(["de", "en"]).default("de"),
  purpose: Statement,
  sections: z
    .array(z.object({ heading: Label(160), blocks: z.array(Block).min(1).max(12) }))
    .min(1)
    .max(12),
  /** Numbers that do not come from an approved claim are assumptions — named, marked, never facts (gate G11). */
  assumptions: z
    .array(z.object({ id: Label(40), text: Label(400), basis: AssumptionBasis }))
    .max(15)
    .default([]),
  /** case_study only: a named customer needs documented approval of the customer (gate G12). */
  customerReference: z.object({ customerName: Label(120), approvalEvidence: EvidenceRef.optional() }).optional(),
  openQuestions: z.array(z.string().min(1)).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});
export type EnablementAsset = z.infer<typeof EnablementAssetV1>;

export interface EnablementSpec {
  label: string;
  group: "assets" | "sales_toolkit";
  /** Structure the agent is asked for (prompt). */
  structure: string;
  /** Numbers need an approved claim or a marked assumption (gate G11). */
  numbersNeedBasis: boolean;
}

export const ENABLEMENT_CATALOG: Record<EnablementType, EnablementSpec> = {
  product_page: {
    label: "Product page",
    group: "assets",
    structure: "Hero (headline, subline, call to action), problem, how it works, benefits per use case, proof points, FAQ, closing call to action.",
    numbersNeedBasis: true,
  },
  solution_brief: {
    label: "Solution brief",
    group: "assets",
    structure: "Situation of the target segment, challenge, solution approach, capabilities mapped to use cases, proof points, next step. Two pages at most.",
    numbersNeedBasis: true,
  },
  whitepaper_outline: {
    label: "Whitepaper outline",
    group: "assets",
    structure: "Working title, thesis, chapters with the key message of each chapter and the evidence it needs, conclusion, call to action.",
    numbersNeedBasis: false,
  },
  thought_leadership: {
    label: "Thought leadership article",
    group: "assets",
    structure: "Title, point of view in one sentence, three arguments (each an interpretation or hypothesis with the evidence it rests on), what this means for the reader, closing. No product pitch in the body.",
    numbersNeedBasis: false,
  },
  regulatory_explainer: {
    label: "Regulatory explainer",
    group: "assets",
    structure: "What the regulation is about (cited source excerpts only), who it concerns, what it means for the reader's business in practice, how the product helps (approved claims only), what remains with experts and counsel. Never promise compliance.",
    numbersNeedBasis: false,
  },
  case_study: {
    label: "Case study",
    group: "assets",
    structure: "Customer situation, challenge, solution, results, quote placeholder, next step. Without documented customer approval keep the customer anonymous and do not set customerReference.",
    numbersNeedBasis: true,
  },
  ad_copy: {
    label: "Ad copy",
    group: "assets",
    structure: "Per variant one section with blocks for the ad fields (adField): LinkedIn introductory text and headline, Google headlines and descriptions. Respect the character limits.",
    numbersNeedBasis: true,
  },
  webinar_outline: {
    label: "Webinar outline",
    group: "assets",
    structure: "Title, promise to the audience, agenda with timing, key message per part, demo moment, poll or questions, call to action.",
    numbersNeedBasis: false,
  },
  video_script: {
    label: "Video script",
    group: "assets",
    structure: "Scenes with narration and on-screen text, 60–120 seconds in total, call to action at the end.",
    numbersNeedBasis: true,
  },
  industry_narrative: {
    label: "Industry narrative",
    group: "assets",
    structure: "Industry situation, typical triggers, buying center in this industry, use cases that matter there, proof points, what to avoid saying.",
    numbersNeedBasis: false,
  },
  pitch_deck_outline: {
    label: "Pitch / first-meeting deck outline",
    group: "sales_toolkit",
    structure: "Slide by slide: title, situation of the buyer, cost of inaction, solution, how it works, proof, why us (approved evidence only), next step.",
    numbersNeedBasis: true,
  },
  demo_story: {
    label: "Demo story",
    group: "sales_toolkit",
    structure: "Persona and situation, three to five demo scenes (what to show, what to say, which pain it answers), the aha moment, transition to next step.",
    numbersNeedBasis: true,
  },
  one_pager: {
    label: "One-pager",
    group: "sales_toolkit",
    structure: "Headline, three benefits with proof points, how it works in three steps, call to action.",
    numbersNeedBasis: true,
  },
  discovery_guide: {
    label: "Discovery guide",
    group: "sales_toolkit",
    structure: "Opening, questions per topic (situation, pain, impact, decision process), signals to listen for, disqualifiers, next step.",
    numbersNeedBasis: false,
  },
  persona_playbook: {
    label: "Persona playbook",
    group: "sales_toolkit",
    structure: "For one decision-maker persona: priorities, triggers, what they need to hear, proof points, objections with responses, questions to ask, what not to say.",
    numbersNeedBasis: true,
  },
  roi_argument: {
    label: "ROI argument",
    group: "sales_toolkit",
    structure: "Cost of today's process, effect of the solution, calculation logic step by step. Every number is an approved claim or a named assumption in `assumptions`; numbers resting on assumptions are never facts.",
    numbersNeedBasis: true,
  },
  sales_training: {
    label: "Product training for sales",
    group: "sales_toolkit",
    structure: "Learning goals, modules with key messages, demo exercise, objection practice, five knowledge check questions with the correct answer.",
    numbersNeedBasis: false,
  },
};
