import { z } from "zod";
import { Statement } from "./common";

/**
 * M16 regulatory change brief: what changed, which messages are affected and
 * what to say instead. Every statement about the law needs a verbatim excerpt
 * of the updated source (G5/G7) and expert review (G7) — the brief is a draft
 * for a legal/regulatory expert and product marketing, never legal advice.
 */
const Label = (max: number) => z.string().min(1).max(max);

export const RegulatoryChangeBriefV1 = z.object({
  schemaVersion: z.literal("regulatory_change_brief.v1"),
  whatChanged: Statement,
  whyItMatters: Statement,
  affectedMessages: z.array(z.object({ asset: Label(200), issue: Statement, suggestedChange: Statement })).max(10),
  messagingImplications: z.array(Statement).min(1).max(8),
  customerCommunication: Statement,
  updatedDoNotSay: z.array(z.string().min(1)).max(15),
  expertValidationRequired: z.array(z.string().min(1)).min(1).max(15),
  approvalChecklist: z.array(z.string().min(1)).min(1).max(20),
});
