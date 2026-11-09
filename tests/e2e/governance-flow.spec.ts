/**
 * E2E (Playwright, simulated mode, TEST database): the three governance
 * stations through the real UI — win/loss & research (M14), launch (M15) and
 * the regulatory radar (M16) — plus the dashboard governance panel.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { login } from "./helpers";

// The demo admin (editor and reviewer rights) — one session, so the per-e-mail login rate limit shared
// with the other specs (editor, reviewer) is not spent.
const USERS = { admin: "admin@nordlicht-demo.example", otherAdmin: "admin@other-demo.example" };
const LAUNCH = "[SYNTHETIC] AI usage monitoring module";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

let launchUrl = "";
let ctx: BrowserContext;
let page: Page;
let reviewer: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await login(page, USERS.admin);
  reviewer = page;
});
test.afterAll(async () => {
  await ctx.close();
});

test("win/loss: computed statistics and a synthesis that quotes only them", async () => {
  await page.goto("/research");
  await expect(page.getByText(/5 of 6 interviews consented/)).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Generate win/loss synthesis" }).click();
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /Win\/loss synthesis —/ }).click();
  await expect(page.getByText(/Expert support was named in 2 of 2 won deals/).first()).toBeVisible();
});

test("launch: readiness is computed; market launch go is refused without an external reference", async () => {
  await page.goto("/launches");
  await page.getByRole("link", { name: LAUNCH }).click();
  await expect(page).toHaveURL(/\/launches\/[a-z0-9_]+$/);
  launchUrl = page.url();
  await expect(page.getByText("At least one external reference customer")).toBeVisible();
  await noHorizontalScroll(page);
  await reviewer.goto(launchUrl);
  await reviewer.locator("#ld-phase").selectOption("market_launch");
  await expect(reviewer.getByText("This phase is not ready: a required check fails.")).toBeVisible();
  await reviewer.getByRole("button", { name: "Record decision" }).click();
  await expect(reviewer.getByText(/Market launch is not ready/)).toBeVisible();
});

test("radar: a prepared deadline shift makes the claim stale and blocks the launch", async () => {
  await page.goto("/radar");
  await expect(page.getByText("No open alert")).toBeVisible();
  await page.getByRole("button", { name: "Load prepared change (simulated)" }).click();
  await page.getByRole("button", { name: "Record change and analyse impact" }).click();
  await expect(page.getByText("1 open alert(s)")).toBeVisible();
  await expect(page.getByRole("link", { name: "clm_reg_high_risk_date" })).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto(launchUrl);
  await expect(page.getByText("No open regulatory radar alert affecting the product")).toBeVisible();
  await expect(page.getByText("1 open alert(s)").first()).toBeVisible();
  await reviewer.goto("/radar");
  await reviewer.getByLabel("Resolution note").fill("Messaging re-reviewed after the shift.");
  await reviewer.getByRole("button", { name: "Resolve alert" }).click();
  await expect(reviewer.getByText(/Re-verify or retire the stale claim/)).toBeVisible();
});

test("dashboard: the governance panel counts what was enforced", async () => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Governance — what the system enforced" })).toBeVisible();
  await expect(page.getByText("Launch “go” refused")).toBeVisible();
  await noHorizontalScroll(page);
});

test("a user of another tenant gets 404 for the demo launch URL", async ({ page: other }) => {
  await login(other, USERS.otherAdmin);
  const res = await other.goto(launchUrl);
  expect(res?.status()).toBe(404);
});
