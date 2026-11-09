import { excerptExistsInSource, type KnowledgeSnapshot } from "../knowledge/snapshot";
import { AD_LIMITS, ENABLEMENT_CATALOG, isEnablementType, type EnablementAsset } from "../schemas/enablement";
import type { Statement } from "../schemas/common";

/**
 * Type-specific gates for the M13 deliverables (enablement_asset.v1). Like all
 * gates they are supporting controls: they never verify that a statement is
 * true. Called by runQualityGates() after the schema check passed.
 */

type Add = (
  gate: "G2_references_exist" | "G11_number_basis" | "G12_customer_approval" | "G13_channel_limits" | "G14_deliverable_type",
  severity: "critical" | "warning" | "info",
  path: string,
  message: string,
) => void;

/**
 * A number a reader would take as a figure. Compound modifiers such as
 * "30-minute walkthrough" or "2-page brief" describe a format, not a result, and
 * are ignored; everything else counts (regulation numbers need a source anyway).
 */
const COMPOUND = /\d+(?:[.,]\d+)?-[A-Za-zÄÖÜäöüß]/g;
export const containsFigure = (text: string) => /\d/.test(text.replace(COMPOUND, ""));

const supported = (s: Statement) => s.claimIds.length > 0 || s.evidence.length > 0;

export function runEnablementGates(assetType: string, data: EnablementAsset, kb: KnowledgeSnapshot, add: Add): void {
  if (!isEnablementType(assetType)) return;

  // ── G14: the content must be the deliverable the asset is ──
  if (data.deliverableType !== assetType) {
    add("G14_deliverable_type", "critical", "$.deliverableType", `Content is a ${data.deliverableType}, but the asset is a ${assetType}`);
  }

  const assumptionIds = new Set(data.assumptions.map((a) => a.id));
  const spec = ENABLEMENT_CATALOG[assetType];

  data.sections.forEach((section, si) => {
    section.blocks.forEach((block, bi) => {
      const path = `$.sections[${si}].blocks[${bi}].statement`;
      const s = block.statement;

      // ── G2 + G11: numbers need an approved claim, a cited source or a marked assumption ──
      for (const id of block.assumptionIds) {
        if (!assumptionIds.has(id)) add("G2_references_exist", "critical", path, `Unknown assumption reference: ${id}`);
      }
      if (block.assumptionIds.length > 0 && s.kind === "fact") {
        add("G11_number_basis", "critical", path, "A statement resting on an assumption cannot be labelled as fact");
      }
      if (spec.numbersNeedBasis && containsFigure(s.text) && !supported(s) && block.assumptionIds.length === 0) {
        add("G11_number_basis", "critical", path, "Number without basis: cite an approved claim or mark it as an assumption");
      }

      // ── G13: ad fields and their character limits ──
      if (assetType === "ad_copy") {
        if (!block.adField) {
          add("G13_channel_limits", "warning", path, "Ad copy block without an ad field — character limits cannot be checked");
        } else {
          const limit = AD_LIMITS[block.adField];
          const n = [...s.text].length;
          if (n > limit.hard) {
            add("G13_channel_limits", "critical", path, `${block.adField}: ${n} characters, the limit is ${limit.hard}`);
          } else if (limit.recommended && n > limit.recommended) {
            add("G13_channel_limits", "warning", path, `${block.adField}: ${n} characters, only about ${limit.recommended} are visible`);
          }
        }
      }
    });
  });

  // ── G12: a named customer in a case study needs the customer's documented approval ──
  if (assetType === "case_study" && data.customerReference) {
    const path = "$.customerReference";
    const ev = data.customerReference.approvalEvidence;
    if (!ev) {
      add("G12_customer_approval", "critical", path, `Customer "${data.customerReference.customerName}" is named without documented approval — anonymise or attach the approval`);
    } else {
      const src = kb.sources.get(ev.sourceId);
      if (!src || src.tenantId !== kb.tenantId) {
        add("G2_references_exist", "critical", path, `Unknown source reference: ${ev.sourceId}`);
      } else if (src.status !== "active" || !excerptExistsInSource(ev.excerpt, src)) {
        add("G12_customer_approval", "critical", path, "The customer approval excerpt was not found in an active stored source");
      }
    }
  }
  if (assetType !== "case_study" && data.customerReference) {
    add("G12_customer_approval", "warning", "$.customerReference", "Customer reference is only used in case studies");
  }
}
