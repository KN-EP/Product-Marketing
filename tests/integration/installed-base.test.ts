/**
 * M18 installed base against a REAL Postgres (TEST_DATABASE_URL): CSV import,
 * findings → hand-overs with a deadline, hand-over moves and closing reasons by
 * industry profile, cost comparisons computed in code, pages — and tenant
 * isolation of every new entry point.
 */
import { randomBytes } from "node:crypto";
import { getAccessFallbackHTTPStatus, isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({}) as { userId?: string; tenantId?: string });
vi.mock("@/server/auth/session", () => ({
  getSession: async () => {
    const s = {
      userId: jar.userId,
      tenantId: jar.tenantId,
      async save() {
        jar.userId = s.userId;
        jar.tenantId = s.tenantId;
      },
      destroy() {
        delete jar.userId;
        delete jar.tenantId;
      },
    };
    return s;
  },
}));

import InstalledBasePage from "@/app/(app)/installed-base/page";
import InstalledUnitPage from "@/app/(app)/installed-base/[id]/page";
import HandoversPage from "@/app/(app)/installed-base/handovers/page";
import CalculatorPage from "@/app/(app)/installed-base/calculator/page";
import CostComparisonPage from "@/app/(app)/installed-base/calculator/[id]/page";
import { importInstalledBaseAction, reportFindingAction, saveCostComparisonAction, setIndustryProfileAction, updateHandoverAction } from "@/app/actions/installed-base";
import { COST_FIELD_KEYS } from "@/domain/installed-base/cost";
import { DEMO_TENANT_ID, OTHER_TENANT_ID } from "@/demo/fixtures";
import type { Actor, Role } from "@/domain/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { NotFoundError } from "@/server/errors";
import { resetRateLimits } from "@/server/http/rate-limit";
import { importInstalledBase, reportFinding, saveCostComparison, setIndustryProfile, updateHandover } from "@/server/installed-base/service";
import { recordInterview } from "@/server/research/service";
import { SEED_IDS, seed } from "../../prisma/seed";

const A = SEED_IDS[DEMO_TENANT_ID];
const B = SEED_IDS[OTHER_TENANT_ID];
const PASSWORD = randomBytes(18).toString("base64url");
const actor = (prefix: "usr_demo" | "usr_other", role: Role): Actor => ({
  kind: "human",
  userId: `${prefix}_${role}`,
  tenantId: prefix === "usr_demo" ? DEMO_TENANT_ID : OTHER_TENANT_ID,
  role,
});
const signInAs = (a: Actor) => {
  jar.userId = a.userId!;
  jar.tenantId = a.tenantId;
};
const EDITOR_A = actor("usr_demo", "editor");
const ADMIN_A = actor("usr_demo", "admin");
const VIEWER_A = actor("usr_demo", "viewer");
const EDITOR_B = actor("usr_other", "editor");

let productA = "";
let productB = "";
const NOW = new Date("2026-11-10T09:00:00Z");

async function resetData() {
  const db = getDb();
  const tenants = { in: [DEMO_TENANT_ID, OTHER_TENANT_ID] };
  await db.costComparison.deleteMany({ where: { tenantId: tenants } });
  await db.serviceHandover.deleteMany({ where: { tenantId: tenants } });
  await db.installedUnit.deleteMany({ where: { tenantId: tenants } });
  await db.installedBaseImport.deleteMany({ where: { tenantId: tenants } });
  await db.winLossInterview.deleteMany({ where: { tenantId: tenants, isSynthetic: false } });
  await db.tenant.updateMany({ where: { id: tenants }, data: { industryProfile: "software" } });
  await db.auditEvent.deleteMany({ where: { tenantId: tenants, action: { startsWith: "installed_base." } } });
}

const csvFor = (product: string, rows: string[]) =>
  ["product;unit;account;region;application;installed;service_contract;spare_part_orders_12m;material_change;regulated;last_service", ...rows.map((r) => `${product};${r}`)].join("\n");

async function importTwo(who: Actor = EDITOR_A, product = productA) {
  return importInstalledBase(
    who,
    getDb(),
    { fileName: "base.csv", csv: csvFor(product, ["U-1;Packaging manufacturer 1;DACH;Food trays;2011;nein;4;ja;ja;2025-03-14", "U-2;Packaging manufacturer 2;DACH;Cups;2020;ja;0;nein;nein;2026-06-01"]) },
    NOW,
  );
}
const unitId = async (tenantId: string, unitRef: string) => (await getDb().installedUnit.findFirstOrThrow({ where: { tenantId, unitRef } })).id;

type Outcome = { rendered: true } | { status: number };
async function render(page: () => Promise<unknown>): Promise<Outcome> {
  try {
    await page();
    return { rendered: true };
  } catch (e) {
    if (isHTTPAccessFallbackError(e)) return { status: getAccessFallbackHTTPStatus(e) };
    throw e;
  }
}
const p = (id: string) => ({ params: Promise.resolve({ id }) });

const scenario = (kind: string, v: Record<string, number> = {}, basis = "measured") => {
  const d: Record<string, number> = {
    investmentEur: 0, depreciationYears: 10, partsPerHour: 10_000, hoursPerYear: 6000, oeePercent: 75, scrapPercent: 4,
    energyKwhPerHour: 120, energyPriceEurPerKwh: 0.2, materialCostPerPartEur: 0.01, labourCostPerHourEur: 60, maintenanceEurPerYear: 60_000, ...v,
  };
  return { kind, values: Object.fromEntries(COST_FIELD_KEYS.map((k) => [k, { value: d[k], basis }])) };
};

beforeAll(async () => {
  await seed(getDb(), { password: PASSWORD });
  productA = (await getDb().product.findFirstOrThrow({ where: { id: A.product } })).name;
  productB = (await getDb().product.findFirstOrThrow({ where: { id: B.product } })).name;
});
afterAll(async () => {
  await resetData();
  await getDb().$disconnect();
});
beforeEach(async () => {
  resetRateLimits();
  delete jar.userId;
  delete jar.tenantId;
  await resetData();
});

describe("installed-base import", () => {
  it("imports units, rejects unknown products and contact data, audits counts only", async () => {
    const csv = csvFor(productA, ["U-1;Packaging manufacturer 1;DACH;Food trays;2011;nein;4;ja;ja;2025-03-14", "U-3;max@kunde.de;DACH;Cups;2012;ja;0;nein;nein;"]) + "\nUnknown series;U-9;Account;DACH;Cups;2012;ja;0;nein;nein;";
    const r = await importInstalledBase(EDITOR_A, getDb(), { fileName: "base.csv", csv }, NOW);
    expect(r).toMatchObject({ rowCount: 3, created: 1, updated: 0 });
    expect(r.rejected).toEqual([
      { line: 3, reason: expect.stringContaining("Contact data") },
      { line: 4, reason: expect.stringContaining("Unknown product") },
    ]);
    const unit = await getDb().installedUnit.findFirstOrThrow({ where: { tenantId: DEMO_TENANT_ID, unitRef: "U-1" } });
    expect(unit).toMatchObject({ productId: A.product, serviceContract: false, sparePartOrders12m: 4, materialChangePlanned: true, regulatedApplication: true });
    expect(unit.installedOn.toISOString().slice(0, 10)).toBe("2011-07-01");
    const audit = await getDb().auditEvent.findFirstOrThrow({ where: { tenantId: DEMO_TENANT_ID, action: "installed_base.imported" } });
    expect(audit.metadata).toEqual({ rowCount: 3, created: 1, updated: 0, rejected: 2 });
    expect(JSON.stringify(audit)).not.toContain("Packaging manufacturer");
  });

  it("a re-import updates units instead of duplicating them", async () => {
    await importTwo();
    const again = await importInstalledBase(EDITOR_A, getDb(), { fileName: "base2.csv", csv: csvFor(productA, ["U-1;Packaging manufacturer 1;DACH;Food trays;2011;ja;1;nein;ja;2026-10-01"]) }, NOW);
    expect(again).toMatchObject({ created: 0, updated: 1 });
    expect(await getDb().installedUnit.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(2);
    expect((await getDb().installedUnit.findFirstOrThrow({ where: { tenantId: DEMO_TENANT_ID, unitRef: "U-1" } })).serviceContract).toBe(true);
  });

  it("products are matched within the tenant only; viewers cannot import; oversized files are refused", async () => {
    const r = await importInstalledBase(EDITOR_A, getDb(), { fileName: "x.csv", csv: csvFor(productB, ["U-1;Account;DACH;Cups;2011;ja;0;nein;nein;"]) }, NOW);
    expect(r.created).toBe(0);
    expect(r.rejected[0]!.reason).toContain("Unknown product");
    await expect(importInstalledBase(VIEWER_A, getDb(), { fileName: "x.csv", csv: "a" }, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(importInstalledBase(EDITOR_A, getDb(), { fileName: "x.csv", csv: "x".repeat(600 * 1024) }, NOW)).rejects.toMatchObject({ status: 413 });
    await expect(importInstalledBase(EDITOR_A, getDb(), { fileName: "x.csv", csv: "product;unit\nA;1" }, NOW)).rejects.toMatchObject({ status: 400 });
  });

  it("the server action takes the tenant from the session", async () => {
    signInAs(EDITOR_B);
    const res = await importInstalledBaseAction({ fileName: "b.csv", csv: csvFor(productB, ["B-1;Account B;Nordics;Cups;2010;nein;3;nein;nein;"]) });
    expect(res).toMatchObject({ ok: true, data: { created: 1 } });
    expect(await getDb().installedUnit.count({ where: { tenantId: DEMO_TENANT_ID } })).toBe(0);
  });
});

describe("findings and hand-overs", () => {
  it("a finding becomes a hand-over due in 5 days", async () => {
    await importTwo();
    const u1 = await unitId(DEMO_TENANT_ID, "U-1");
    const r = await reportFinding(EDITOR_A, getDb(), { unitId: u1, offer: "retrofit", finding: "Heizung verschlissen, Kunde plant Rezyklat." }, NOW);
    expect(r.dueOn).toBe("2026-11-15");
    const h = await getDb().serviceHandover.findFirstOrThrow({ where: { id: r.handoverId } });
    expect(h).toMatchObject({ tenantId: DEMO_TENANT_ID, status: "open", offer: "retrofit", reportedById: EDITOR_A.userId });
  });

  it("moves forward only; lost needs reasons of the tenant's industry profile", async () => {
    await importTwo();
    const { handoverId } = await reportFinding(EDITOR_A, getDb(), { unitId: await unitId(DEMO_TENANT_ID, "U-1"), offer: "retrofit", finding: "Steuerung abgekündigt, Ersatzteile knapp." }, NOW);
    await expect(updateHandover(EDITOR_A, getDb(), { handoverId, status: "won" }, NOW)).rejects.toMatchObject({ status: 409 });
    await updateHandover(EDITOR_A, getDb(), { handoverId, status: "contacted" }, NOW);
    await updateHandover(EDITOR_A, getDb(), { handoverId, status: "offered" }, NOW);
    await expect(updateHandover(EDITOR_A, getDb(), { handoverId, status: "lost" }, NOW)).rejects.toMatchObject({ status: 400 });
    // software profile: a machinery code is not accepted
    await expect(updateHandover(EDITOR_A, getDb(), { handoverId, status: "lost", reasons: ["third_party_retrofit"] }, NOW)).rejects.toMatchObject({ status: 400 });
    await setIndustryProfile(ADMIN_A, getDb(), { profile: "machinery" });
    await updateHandover(EDITOR_A, getDb(), { handoverId, status: "lost", reasons: ["third_party_retrofit", "price_value"] }, NOW);
    const h = await getDb().serviceHandover.findFirstOrThrow({ where: { id: handoverId } });
    expect(h).toMatchObject({ status: "lost", reasons: ["third_party_retrofit", "price_value"] });
    expect(h.contactedAt).not.toBeNull();
    expect(h.closedAt).not.toBeNull();
    await expect(updateHandover(EDITOR_A, getDb(), { handoverId, status: "won", reasons: [] }, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("viewers cannot report or move; foreign ids are 404", async () => {
    await importTwo();
    await importTwo(EDITOR_B, productB);
    const uA = await unitId(DEMO_TENANT_ID, "U-1");
    const uB = await unitId(OTHER_TENANT_ID, "U-1");
    await expect(reportFinding(VIEWER_A, getDb(), { unitId: uA, offer: "retrofit", finding: "Heizung verschlissen, Kunde plant Rezyklat." }, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(reportFinding(EDITOR_A, getDb(), { unitId: uB, offer: "retrofit", finding: "Heizung verschlissen, Kunde plant Rezyklat." }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    const { handoverId } = await reportFinding(EDITOR_B, getDb(), { unitId: uB, offer: "service_contract", finding: "Kein Servicevertrag, Anlage läuft dreischichtig." }, NOW);
    await expect(updateHandover(EDITOR_A, getDb(), { handoverId, status: "contacted" }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    signInAs(EDITOR_A);
    expect(await reportFindingAction({ unitId: uB, offer: "retrofit", finding: "Heizung verschlissen, Kunde plant Rezyklat.", tenantId: OTHER_TENANT_ID })).toMatchObject({ ok: false });
    expect(await updateHandoverAction({ handoverId, status: "contacted" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("industry profile", () => {
  it("only admins change it; interviews follow it", async () => {
    await expect(setIndustryProfile(EDITOR_A, getDb(), { profile: "machinery" })).rejects.toMatchObject({ status: 403 });
    const interview = { productId: A.product, accountLabel: "Account Z", segment: "Packaging", outcome: "lost", reasons: ["trial_result"], primaryReason: "trial_result", consentStatus: "requested" };
    await expect(recordInterview(EDITOR_A, getDb(), interview)).rejects.toMatchObject({ status: 400 });
    signInAs(ADMIN_A);
    expect(await setIndustryProfileAction({ profile: "machinery" })).toMatchObject({ ok: true });
    await expect(recordInterview(EDITOR_A, getDb(), interview)).resolves.toMatchObject({ interviewId: expect.any(String) });
    await expect(recordInterview(EDITOR_A, getDb(), { ...interview, reasons: ["time_to_audit"], primaryReason: "time_to_audit" })).rejects.toMatchObject({ status: 400 });
    expect((await getDb().tenant.findFirstOrThrow({ where: { id: OTHER_TENANT_ID } })).industryProfile).toBe("software");
  });
});

describe("cost comparisons", () => {
  it("stores the result computed in code and says when it contains assumptions", async () => {
    await importTwo();
    const u1 = await unitId(DEMO_TENANT_ID, "U-1");
    const { comparisonId } = await saveCostComparison(EDITOR_A, getDb(), {
      productId: A.product,
      unitId: u1,
      title: "U-1: retrofit or new machine",
      scenarios: [scenario("as_is"), scenario("retrofit", { investmentEur: 400_000, oeePercent: 82, scrapPercent: 2.5, energyKwhPerHour: 95, maintenanceEurPerYear: 35_000 }), scenario("new_machine", { investmentEur: 1_500_000, partsPerHour: 15_000 }, "illustrative")],
    });
    const c = await getDb().costComparison.findFirstOrThrow({ where: { id: comparisonId } });
    const result = c.result as { status: string; scenarios: { kind: string; costPerGoodPartEur: number; paybackYears: number | null }[] };
    expect(result.status).toBe("contains_assumptions");
    expect(result.scenarios.map((s) => s.kind)).toEqual(["as_is", "retrofit", "new_machine"]);
    expect(result.scenarios[1]).toMatchObject({ costPerGoodPartEur: 0.0217, paybackYears: 3.2 });
  });

  it("foreign product or unit → 404; a unit of another product → 400; viewers 403", async () => {
    await importTwo();
    await importTwo(EDITOR_B, productB);
    const base = { title: "Test comparison", scenarios: [scenario("as_is"), scenario("retrofit")] };
    await expect(saveCostComparison(EDITOR_A, getDb(), { ...base, productId: B.product })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveCostComparison(EDITOR_A, getDb(), { ...base, productId: A.product, unitId: await unitId(OTHER_TENANT_ID, "U-1") })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveCostComparison(VIEWER_A, getDb(), { ...base, productId: A.product })).rejects.toMatchObject({ status: 403 });
    const otherProduct = await getDb().product.create({ data: { tenantId: DEMO_TENANT_ID, name: "Second series", area: "x", description: "x" } });
    try {
      await expect(saveCostComparison(EDITOR_A, getDb(), { ...base, productId: otherProduct.id, unitId: await unitId(DEMO_TENANT_ID, "U-1") })).rejects.toMatchObject({ status: 400 });
    } finally {
      await getDb().product.delete({ where: { id: otherProduct.id } });
    }
    signInAs(EDITOR_A);
    expect(await saveCostComparisonAction({ ...base, productId: A.product })).toMatchObject({ ok: true });
  });
});

describe("pages", () => {
  it("render for the own tenant and 404 for foreign ids", async () => {
    await importTwo();
    await importTwo(EDITOR_B, productB);
    const uA = await unitId(DEMO_TENANT_ID, "U-1");
    const uB = await unitId(OTHER_TENANT_ID, "U-1");
    await reportFinding(EDITOR_A, getDb(), { unitId: uA, offer: "retrofit", finding: "Heizung verschlissen, Kunde plant Rezyklat." }, NOW);
    const { comparisonId } = await saveCostComparison(EDITOR_A, getDb(), { productId: A.product, unitId: uA, title: "Page test", scenarios: [scenario("as_is"), scenario("retrofit")] });
    const { comparisonId: foreignComparison } = await saveCostComparison(EDITOR_B, getDb(), { productId: B.product, title: "Foreign", scenarios: [scenario("as_is"), scenario("retrofit")] });
    signInAs(EDITOR_A);
    expect(await render(() => InstalledBasePage({ searchParams: Promise.resolve({ region: "DACH" }) }))).toEqual({ rendered: true });
    expect(await render(() => InstalledUnitPage(p(uA)))).toEqual({ rendered: true });
    expect(await render(() => HandoversPage())).toEqual({ rendered: true });
    expect(await render(() => CalculatorPage({ searchParams: Promise.resolve({ unit: uA }) }))).toEqual({ rendered: true });
    expect(await render(() => CostComparisonPage(p(comparisonId)))).toEqual({ rendered: true });
    expect(await render(() => InstalledUnitPage(p(uB)))).toEqual({ status: 404 });
    expect(await render(() => CostComparisonPage(p(foreignComparison)))).toEqual({ status: 404 });
    // views never list another tenant's units
    const units = await tenantDb(EDITOR_A, getDb()).views.installedUnits();
    expect(units.every((u) => u.product.id === A.product)).toBe(true);
  });
});
