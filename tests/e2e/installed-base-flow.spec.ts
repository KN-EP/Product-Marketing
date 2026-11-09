/**
 * E2E (Playwright, simulated mode, TEST database): M18 installed base through the
 * real UI — industry profile, CSV import, target list, finding → hand-over with a
 * deadline, closing with machine-builder reasons, cost-per-part calculator.
 * Runs as the admin of the SECOND demo tenant, so the demo tenant stays untouched.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { COST_FIELDS, COST_FIELD_KEYS } from "../../src/domain/installed-base/cost";
import { login } from "./helpers";

const ADMIN = "admin@other-demo.example";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await login(page, ADMIN);
});
test.afterAll(async () => {
  await ctx.close();
});

test("admin sets the industry profile to machine builder", async () => {
  await page.goto("/settings");
  await page.getByLabel("Industry profile").selectOption("machinery");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("import the installed base and see the computed target list", async () => {
  await page.goto("/installed-base");
  await expect(page.getByText(/No installed base yet/)).toBeVisible();
  await page.getByRole("button", { name: "Fill with a fictional sample" }).click();
  await page.getByRole("button", { name: "Import installed base" }).click();
  await expect(page.getByText("Imported 2 new and updated 0 unit(s) from 2 row(s).")).toBeVisible();
  const first = page.getByRole("row").nth(1);
  await expect(first).toContainText("A-1001");
  await expect(first).toContainText("Retrofit");
  await expect(first).toContainText("Older than 10 years");
});

test("a finding is handed over to sales and closed as lost with a machine-builder reason", async () => {
  await page.getByRole("link", { name: "A-1001" }).click();
  await expect(page.getByText("Suggested offer", { exact: true })).toBeVisible();
  await page.getByLabel(/Finding/).fill("Heizung verschlissen, Kunde plant Umstellung auf Rezyklat.");
  await page.getByRole("button", { name: /Hand over to sales/ }).click();
  await expect(page.getByText(/Handed over to sales — contact due by/)).toBeVisible();

  await page.goto("/installed-base/handovers");
  await page.getByRole("button", { name: "Customer contacted" }).click();
  await page.getByRole("button", { name: "Offer sent" }).click();
  await page.getByRole("button", { name: "Lost" }).click();
  await page.getByLabel("Third-party retrofitter").check();
  await page.getByRole("button", { name: "Close as lost" }).click();
  await expect(page.getByText("No open hand-overs.")).toBeVisible();
  await expect(page.getByText("Third-party retrofitter: 1")).toBeVisible();
});

test("cost-per-part calculator: result computed on the server, assumptions flagged", async () => {
  await page.goto("/installed-base");
  await page.getByRole("link", { name: "A-1001" }).click();
  await page.getByRole("link", { name: "Compare cost per part" }).click();
  const values: Record<string, [string, string]> = {
    investmentEur: ["0", "400000"],
    depreciationYears: ["10", "10"],
    partsPerHour: ["10000", "10000"],
    hoursPerYear: ["6000", "6000"],
    oeePercent: ["75", "82"],
    scrapPercent: ["4", "2,5"],
    energyKwhPerHour: ["120", "95"],
    energyPriceEurPerKwh: ["0,2", "0,2"],
    materialCostPerPartEur: ["0,01", "0,01"],
    labourCostPerHourEur: ["60", "60"],
    maintenanceEurPerYear: ["60000", "35000"],
  };
  for (const k of COST_FIELD_KEYS) {
    await page.getByLabel(`As is — ${COST_FIELDS[k].label}`, { exact: true }).fill(values[k]![0]);
    await page.getByLabel(`Retrofit — ${COST_FIELDS[k].label}`, { exact: true }).fill(values[k]![1]);
  }
  await page.getByLabel(`Retrofit — ${COST_FIELDS.oeePercent.label} — basis`).selectOption("benchmark_to_verify");
  await page.getByRole("button", { name: "Calculate and save" }).click();
  await expect(page).toHaveURL(/\/installed-base\/calculator\/[a-z0-9]+$/);
  await expect(page.getByText("contains assumptions")).toBeVisible();
  const retrofit = page.getByRole("row", { name: /^Retrofit/ });
  await expect(retrofit).toContainText("0.0217 €");
  await expect(retrofit).toContainText("-7.5 %");
  await expect(retrofit).toContainText("3.2 years");
});

test("installed base at 375 px: no horizontal scroll", async () => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/installed-base");
  await noHorizontalScroll(page);
  await page.goto("/installed-base/handovers");
  await noHorizontalScroll(page);
});
