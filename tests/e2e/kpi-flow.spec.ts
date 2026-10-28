/**
 * E2E (Playwright, simulated mode, TEST database): KPI analysis (M11) through
 * the real UI — approve the plan, KPI tree, targets, CSV import, computed
 * table, performance review.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD!;
const USERS = { editor: "editor@dataguard-demo.example", reviewer: "reviewer@dataguard-demo.example" };
const SEEDED_CAMPAIGN = "[SYNTHETIC] AI inventory campaign — CISOs DACH";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

let campaignUrl = "";
let planUrl = "";

test("editor generates a campaign package (its plan feeds the KPI tree)", async ({ page }) => {
  await login(page, USERS.editor);
  await page.goto("/campaigns");
  await page.getByRole("link", { name: SEEDED_CAMPAIGN }).click();
  await expect(page).toHaveURL(/\/campaigns\/[a-z0-9_]+$/);
  campaignUrl = page.url();
  await page.getByRole("button", { name: /Generate (new )?campaign package/ }).click();
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /Campaign plan —/ }).click();
  await expect(page).toHaveURL(/\/assets\/[a-z0-9]+$/);
  planUrl = page.url();
  await page.goto(`${campaignUrl}/performance`);
  await expect(page.getByText("The KPI tree comes from the approved campaign plan.")).toBeVisible();
  await logout(page);
});

test("reviewer approves the campaign plan with expert acknowledgement", async ({ page }) => {
  await login(page, USERS.reviewer);
  await page.goto(planUrl);
  await page.getByRole("radio", { name: "Approve this version" }).check();
  await page.getByRole("checkbox", { name: /qualified expert/ }).check();
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Approved: v1")).toBeVisible();
  await logout(page);
});

test("editor builds the KPI tree, sets targets, imports data and generates a performance review", async ({ page }) => {
  await login(page, USERS.editor);
  await page.goto(`${campaignUrl}/performance`);
  await page.getByRole("button", { name: /Create KPI tree from approved plan v\d+/ }).click();
  await expect(page.getByText("Checklist downloads").first()).toBeVisible();

  const targets: [string, string][] = [
    ["Checklist downloads", "400"],
    ["Webinar registrations", "100"],
    ["Sales-accepted meetings", "50"],
  ];
  for (const [name, value] of targets) {
    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByLabel("Target").fill(value);
    await row.getByRole("button", { name: `Save KPI ${name}` }).click();
    await expect(row.getByText("Saved.")).toBeVisible();
  }

  await page.getByRole("button", { name: "Fill with synthetic sample data" }).click();
  await page.getByRole("button", { name: "Import measurements" }).click();
  await expect(page.getByText(/Imported \d+ of \d+ row\(s\)\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Target vs. actual" })).toBeVisible();
  await expect(page.locator("#results").getByText(/on track|at risk|off track/).first()).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByRole("button", { name: "Generate performance review" }).click();
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /Performance review —/ }).click();
  await expect(page.getByRole("heading", { name: "KPI results (computed from imported data)" })).toBeVisible();
  await expect(page.getByText("Gates passed").first()).toBeVisible();
  await noHorizontalScroll(page);
});

test("performance page at 375 px: no horizontal scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await login(page, USERS.editor);
  await page.goto(`${campaignUrl}/performance`);
  await noHorizontalScroll(page);
  await ctx.close();
});
