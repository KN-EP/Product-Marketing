/**
 * E2E (Playwright, simulated mode, TEST database): the campaign package
 * (M8–M10) through the real UI — briefing, generation, the blocked content
 * matrix, a new briefing via the form, isolation and layout.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD!;
const USERS = {
  editor: "editor@dataguard-demo.example",
  otherAdmin: "admin@other-demo.example",
};
const SEEDED_CAMPAIGN = "[SYNTHETIC] AI inventory campaign — CISOs DACH";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

let campaignUrl = "";

test("editor generates the campaign package; content matrix v1 is blocked by the gates", async ({ page }) => {
  await login(page, USERS.editor);
  await page.getByRole("link", { name: "Campaigns" }).first().click();
  await expect(page).toHaveURL(/\/campaigns$/);
  await noHorizontalScroll(page);

  await page.getByRole("link", { name: SEEDED_CAMPAIGN }).click();
  await expect(page).toHaveURL(/\/campaigns\/[a-z0-9_]+$/);
  campaignUrl = page.url();
  await expect(page.getByText("Drafts for people, not automation")).toBeVisible();
  await expect(page.getByText("Outreach sequence")).toBeVisible();

  await page.getByRole("button", { name: "Generate campaign package (3 deliverables)" }).click();
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Deliverables (3)" })).toBeVisible();
  await expect(page.getByText("Campaign package (3 deliverables)").first()).toBeVisible();

  await page.getByRole("link", { name: /Content matrix —/ }).click();
  await expect(page).toHaveURL(/\/assets\/[a-z0-9]+$/);
  await expect(page.getByText("Critical — block approval").first()).toBeVisible();
  await expect(page.getByText("Become EU AI Act compliant in 30 days — guaranteed.")).toBeVisible();
  await noHorizontalScroll(page);

  await page.goto(campaignUrl);
  await expect(page.getByRole("link", { name: /Campaign plan —/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sales play —/ })).toBeVisible();
  await noHorizontalScroll(page);
});

test("editor creates a retention campaign through the form", async ({ page }) => {
  await login(page, USERS.editor);
  await page.goto("/campaigns");
  await page.getByLabel("Campaign name").fill("Retention push Q1");
  await page.getByLabel("Campaign type").selectOption("retention");
  await page.getByLabel("Objective").fill("Keep existing customers active in the AI system register.");
  await page.getByRole("checkbox", { name: "Customer success" }).check();
  await page.getByLabel("Other channels (comma-separated)").fill("Partner newsletter");
  await page.getByLabel("Start (optional)").fill("2027-01-04");
  await page.getByLabel("End (optional)").fill("2027-02-26");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/campaigns\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Retention push Q1" })).toBeVisible();
  await expect(page.getByText("Retention play")).toBeVisible();
  await expect(page.getByText("LinkedIn, Email, Webinar, Sales outreach, Customer success, Partner newsletter")).toBeVisible();
  await expect(page.getByText("2027-01-04 – 2027-02-26")).toBeVisible();
});

test("a user of another tenant gets 404 for the DataGuard campaign URL", async ({ page }) => {
  await login(page, USERS.otherAdmin);
  const res = await page.goto(campaignUrl);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("campaign pages at 375 px: no horizontal scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await login(page, USERS.editor);
  for (const url of ["/campaigns", campaignUrl]) {
    await page.goto(url);
    await noHorizontalScroll(page);
  }
  await ctx.close();
});
