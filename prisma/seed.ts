/**
 * Seed: SYNTHETIC demo data only.
 *
 * - "DataGuard Demo – Unofficial" from src/demo/fixtures.ts (synthetic; not a
 *   DataGuard product and implies no approval by DataGuard).
 * - A second synthetic tenant, used to prove tenant isolation.
 * - editor / reviewer / admin per tenant. Passwords: DEMO_USER_PASSWORD.
 *
 * Idempotent (upserts on fixed ids). Runs as the DML-only app role via
 * DATABASE_URL — the seed needs no DDL rights.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  DEMO_CLAIMS,
  DEMO_COMPETITOR_EVIDENCE,
  DEMO_SOURCES,
  DEMO_TENANT_ID,
  DEMO_TENANT_NAME,
  FOREIGN_CLAIM,
  OTHER_TENANT_ID,
  SIMULATED_MESSAGING_FRAMEWORK,
} from "../src/demo/fixtures";
import { buildSnapshot, type ClaimRecord, type SourceRecord } from "../src/domain/knowledge/snapshot";
import { runQualityGates } from "../src/domain/quality-gates/gates";
import type { Role } from "../src/domain/actor";
import { createPrismaClient, type Db } from "../src/server/db/client";
import { hashPassword } from "../src/server/auth/password";

export const OTHER_TENANT_NAME = "Other Demo Tenant – Synthetic";
const ROLES: Role[] = ["editor", "reviewer", "admin"];

export const SEED_TENANTS = [
  { id: DEMO_TENANT_ID, slug: "dataguard-demo", name: DEMO_TENANT_NAME, emailDomain: "dataguard-demo.example", userPrefix: "usr_demo" },
  { id: OTHER_TENANT_ID, slug: "other-demo", name: OTHER_TENANT_NAME, emailDomain: "other-demo.example", userPrefix: "usr_other" },
] as const;

/** Seeded ids the isolation and workflow tests refer to. */
export const SEED_IDS = {
  [DEMO_TENANT_ID]: {
    asset: "ast_demo_messaging",
    claim: DEMO_CLAIMS[0]!.id,
    source: DEMO_SOURCES[0]!.id,
    product: "prd_demo_ai_governance",
    persona: "per_demo_ciso",
    regulatoryTrigger: "rtr_demo_eu_ai_act",
    competitors: ["cmp_a", "cmp_b", "cmp_c"],
  },
  [OTHER_TENANT_ID]: {
    asset: "ast_other_brief",
    claim: FOREIGN_CLAIM.id,
    source: "src_other_note",
    product: "prd_other_demo",
    persona: "per_other_buyer",
    regulatoryTrigger: "rtr_other",
    competitors: ["cmp_other_1", "cmp_other_2", "cmp_other_3"],
  },
} as const;

/** Persona, regulatory trigger and competitors so each tenant can start a run. */
async function upsertRunContext(
  db: Db,
  tenantId: keyof typeof SEED_IDS,
  data: { persona: { name: string; role: string; market: string }; trigger: { name: string; jurisdiction: string; summary: string; sourceIds: string[] }; competitorNames: string[] },
) {
  const ids = SEED_IDS[tenantId];
  const persona = { ...data.persona, goals: ["[SYNTHETIC] goal"], concerns: ["[SYNTHETIC] concern"], isSynthetic: true };
  await db.persona.upsert({ where: { id: ids.persona }, create: { id: ids.persona, tenantId, ...persona }, update: persona });
  await db.regulatoryTrigger.upsert({
    where: { id: ids.regulatoryTrigger },
    create: { id: ids.regulatoryTrigger, tenantId, ...data.trigger },
    update: data.trigger,
  });
  for (const [i, id] of ids.competitors.entries()) {
    const c = { name: data.competitorNames[i]!, isPlaceholder: true };
    await db.competitor.upsert({ where: { id }, create: { id, tenantId, ...c }, update: c });
  }
}

export function seedUserEmail(tenantIndex: 0 | 1, role: Role): string {
  return `${role}@${SEED_TENANTS[tenantIndex].emailDomain}`;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const json = <T>(v: T) => JSON.parse(JSON.stringify(v));

const OTHER_SOURCE: SourceRecord = {
  id: "src_other_note",
  tenantId: OTHER_TENANT_ID,
  title: "[SYNTHETIC] Other tenant — internal product note (demo)",
  url: null,
  status: "active",
  isSynthetic: true,
  content: "SYNTHETIC DEMO SOURCE. This record belongs to the second demo tenant and exists only to test isolation.",
};

async function upsertKnowledge(db: Db, tenantId: string, productId: string, sources: SourceRecord[], claims: ClaimRecord[]) {
  for (const s of sources) {
    const data = {
      kind: "synthetic_demo" as const,
      title: s.title,
      url: s.url,
      status: s.status,
      content: s.content,
      contentHash: sha256(s.content),
      isSynthetic: true,
    };
    await db.source.upsert({ where: { id: s.id }, create: { id: s.id, tenantId, ...data }, update: data });
  }
  for (const c of claims) {
    const data = { productId, text: c.text, category: c.category, state: c.state, isSynthetic: true };
    await db.claim.upsert({ where: { id: c.id }, create: { id: c.id, tenantId, ...data }, update: data });
    for (const [i, e] of c.evidence.entries()) {
      const id = `${c.id}_ev${i}`;
      const ev = { claimId: c.id, sourceId: e.sourceId, excerpt: e.excerpt, locator: e.locator ?? null };
      await db.claimEvidence.upsert({ where: { id }, create: { id, tenantId, ...ev }, update: ev });
    }
  }
}

async function upsertAsset(
  db: Db,
  tenantId: string,
  asset: { id: string; title: string; content: unknown; report: ReturnType<typeof runQualityGates> },
) {
  const versionId = `${asset.id}_v1`;
  const state = asset.report.passed ? "pending_review" : "draft";
  await db.asset.upsert({
    where: { id: asset.id },
    create: { id: asset.id, tenantId, type: "messaging_framework", title: asset.title, state },
    update: { title: asset.title, state },
  });
  // AssetVersion is immutable: create once, never update.
  const existing = await db.assetVersion.findFirst({ where: { id: versionId, tenantId } });
  if (!existing) {
    await db.assetVersion.create({
      data: {
        id: versionId,
        tenantId,
        assetId: asset.id,
        versionNumber: 1,
        schemaVersion: "messaging_framework.v1",
        content: json(asset.content),
        gateReport: json(asset.report),
        gatesPassed: asset.report.passed,
        generationMode: "simulated",
      },
    });
  }
  await db.asset.update({ where: { id: asset.id }, data: { currentVersionId: versionId } });
}

export async function seed(db: Db, opts: { password: string }): Promise<void> {
  if (opts.password.length < 12) throw new Error("DEMO_USER_PASSWORD must be at least 12 characters");
  const passwordHash = await hashPassword(opts.password);

  for (const [i, t] of SEED_TENANTS.entries()) {
    await db.tenant.upsert({
      where: { id: t.id },
      create: { id: t.id, slug: t.slug, name: t.name, isDemo: true },
      update: { slug: t.slug, name: t.name, isDemo: true },
    });
    for (const role of ROLES) {
      const id = `${t.userPrefix}_${role}`;
      const email = seedUserEmail(i as 0 | 1, role);
      const name = `[SYNTHETIC] ${t.name} ${role}`;
      await db.user.upsert({ where: { id }, create: { id, email, name, passwordHash }, update: { email, name, passwordHash } });
      await db.membership.upsert({
        where: { tenantId_userId: { tenantId: t.id, userId: id } },
        create: { id: `mem_${id}`, tenantId: t.id, userId: id, role },
        update: { role },
      });
    }
  }

  // ── Tenant A: DataGuard Demo – Unofficial (fixtures) ──
  const demoProduct = "prd_demo_ai_governance";
  const productData = {
    name: "[SYNTHETIC] AI Governance module (demo)",
    area: "AI governance",
    description: "Synthetic demo product. Does not describe a real DataGuard product.",
    isSynthetic: true,
  };
  await db.product.upsert({
    where: { id: demoProduct },
    create: { id: demoProduct, tenantId: DEMO_TENANT_ID, ...productData },
    update: productData,
  });
  await upsertKnowledge(db, DEMO_TENANT_ID, demoProduct, DEMO_SOURCES, DEMO_CLAIMS);

  await upsertRunContext(db, DEMO_TENANT_ID, {
    persona: { name: "[SYNTHETIC] CISO, German mid-sized company", role: "CISO", market: "DACH mid-market" },
    trigger: {
      name: "[SYNTHETIC] EU AI Act — demo summary",
      jurisdiction: "EU",
      summary: "[SYNTHETIC] Demo summary only; replace with verified excerpts of Regulation (EU) 2024/1689.",
      sourceIds: ["src_demo_regulatory_summary"],
    },
    competitorNames: ["Competitor A (placeholder)", "Competitor B (placeholder)", "Competitor C (placeholder)"],
  });
  for (const e of DEMO_COMPETITOR_EVIDENCE) {
    const data = { competitorId: e.competitorId, sourceId: e.sourceId, assertion: e.assertion, excerpt: e.excerpt, state: e.state };
    await db.competitorEvidence.upsert({ where: { id: e.id }, create: { id: e.id, tenantId: DEMO_TENANT_ID, ...data }, update: data });
  }

  const demoKb = buildSnapshot({
    tenantId: DEMO_TENANT_ID,
    sources: DEMO_SOURCES,
    claims: DEMO_CLAIMS,
    competitorEvidence: DEMO_COMPETITOR_EVIDENCE,
  });
  await upsertAsset(db, DEMO_TENANT_ID, {
    id: SEED_IDS[DEMO_TENANT_ID].asset,
    title: "[SYNTHETIC] Messaging framework — AI Governance module (simulated)",
    content: SIMULATED_MESSAGING_FRAMEWORK,
    report: runQualityGates("messaging_framework", SIMULATED_MESSAGING_FRAMEWORK, demoKb),
  });

  // ── Tenant B: second synthetic tenant (isolation) ──
  const otherProduct = "prd_other_demo";
  const otherProductData = {
    name: "[SYNTHETIC] Other demo product",
    area: "Synthetic",
    description: "Synthetic record for tenant-isolation tests.",
    isSynthetic: true,
  };
  await db.product.upsert({
    where: { id: otherProduct },
    create: { id: otherProduct, tenantId: OTHER_TENANT_ID, ...otherProductData },
    update: otherProductData,
  });
  await upsertKnowledge(db, OTHER_TENANT_ID, otherProduct, [OTHER_SOURCE], [{ ...FOREIGN_CLAIM, text: "[SYNTHETIC] Foreign tenant claim" }]);
  await upsertRunContext(db, OTHER_TENANT_ID, {
    persona: { name: "[SYNTHETIC] Other tenant buyer", role: "Buyer", market: "Synthetic" },
    trigger: { name: "[SYNTHETIC] Other trigger", jurisdiction: "N/A", summary: "[SYNTHETIC] Isolation test record.", sourceIds: ["src_other_note"] },
    competitorNames: ["[SYNTHETIC] Other competitor 1", "[SYNTHETIC] Other competitor 2", "[SYNTHETIC] Other competitor 3"],
  });
  const otherKb = buildSnapshot({ tenantId: OTHER_TENANT_ID, sources: [OTHER_SOURCE], claims: [FOREIGN_CLAIM] });
  const otherContent = { ...SIMULATED_MESSAGING_FRAMEWORK, pillars: [], objections: [] };
  await upsertAsset(db, OTHER_TENANT_ID, {
    id: SEED_IDS[OTHER_TENANT_ID].asset,
    title: "[SYNTHETIC] Other tenant messaging draft (simulated)",
    content: otherContent,
    report: runQualityGates("messaging_framework", otherContent, otherKb),
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!password) throw new Error("DEMO_USER_PASSWORD is not set (see .env.example)");
  const db = createPrismaClient(url);
  try {
    await seed(db, { password });
    console.log("Seed complete: 2 synthetic demo tenants, 3 users each.");
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error("Seed failed:", e instanceof Error ? e.message : "unknown error");
    process.exit(1);
  });
}
