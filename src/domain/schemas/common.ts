import { z } from "zod";

/** Every generated statement must declare what it is. Gate 6 relies on this. */
export const StatementKind = z.enum(["fact", "interpretation", "hypothesis", "suggestion"]);
export type StatementKind = z.infer<typeof StatementKind>;

export const EvidenceRef = z.object({
  sourceId: z.string().min(1),
  excerpt: z.string().min(1).max(1200),
});

export const Statement = z.object({
  text: z.string().min(1).max(2000),
  kind: StatementKind,
  claimIds: z.array(z.string().min(1)).max(20).default([]),
  competitorEvidenceIds: z.array(z.string().min(1)).max(20).default([]),
  evidence: z.array(EvidenceRef).max(20).default([]),
  /** M11: names of KPIs in the asset's own kpiSnapshot (performance reviews only; gates G2 + G10). */
  kpiRefs: z.array(z.string().min(1).max(80)).max(10).default([]),
  /** Self-declared by the model. Gate 7 also detects this independently. */
  regulatory: z.boolean().default(false),
  comparative: z.boolean().default(false),
});
export type Statement = z.infer<typeof Statement>;

/** A proof point is by definition a fact backed by at least one claim. */
export const ProofPoint = Statement.extend({
  kind: z.literal("fact"),
  claimIds: z.array(z.string().min(1)).min(1).max(20),
});
