/**
 * E2E (Playwright, simulated mode, TEST database): the review loop of the
 * guided demo end to end through the real UI, plus isolation and layout checks.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD!;
const USERS = {
  editor: "editor@dataguard-demo.example",
  reviewer: "reviewer@dataguard-demo.example",
  otherAdmin: "admin@other-demo.example",
};

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

let battlecardUrl = "";

test("editor starts a run; battlecard v1 fails the gates; input brief is internal", async ({ page }) => {
  await login(page, USERS.editor);
  await page.goto("/workflows");
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Start workflow (3 deliverables)" }).click();
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Deliverables (3)" })).toBeVisible();
  await expect(page.getByText("Input brief (internal — not for external use)").first()).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByRole("link", { name: /Competitive battlecard —/ }).click();
  await expect(page).toHaveURL(/\/assets\/[a-z0-9]+$/);
  battlecardUrl = page.url();
  await expect(page.getByText("Critical — block approval").first()).toBeVisible();
  await noHorizontalScroll(page);
  await logout(page);
});

test("reviewer cannot approve v1 and requests changes (explicit selection)", async ({ page }) => {
  await login(page, USERS.reviewer);
  await page.goto(battlecardUrl);
  const approve = page.getByRole("radio", { name: "Approve this version" });
  await expect(approve).toBeDisabled();
  await expect(page.getByText("Approval is not possible:")).toBeVisible();
  const submit = page.getByRole("button", { name: "Record decision" });
  await expect(submit).toBeDisabled(); // nothing pre-selected
  await page.getByRole("radio", { name: "Request changes" }).check();
  await expect(submit).toBeDisabled(); // comment required
  await page.getByLabel(/Comment/).fill("Comparison needs approved competitor evidence; remove the pending claim.");
  await submit.click();
  await expect(page.getByText("changes requested").first()).toBeVisible();
  await logout(page);
});

test("editor loads the prepared correction, reviews it, saves v2 and submits", async ({ page }) => {
  await login(page, USERS.editor);
  await page.goto(battlecardUrl);
  await page.getByRole("link", { name: "Create corrected version" }).click();
  await expect(page).toHaveURL(/\/edit$/);

  // Loading only fills the form; Cancel discards — still one version.
  await page.getByRole("button", { name: "Load prepared correction (simulated)" }).click();
  await expect(page.getByText("nothing has been stored yet")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(battlecardUrl);
  await expect(page.getByRole("link", { name: "v2" })).toHaveCount(0);

  await page.getByRole("link", { name: "Create corrected version" }).click();
  await page.getByRole("button", { name: "Load prepared correction (simulated)" }).click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save as new version (based on v1)" }).click();
  await expect(page).toHaveURL(battlecardUrl);
  await expect(page.getByText("Human-edited (based on v1)").first()).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("pending review").first()).toBeVisible();
  await logout(page);
});

test("reviewer approves v2 with an explicit selection; Markdown export has v2, reviewer, claim and source refs", async ({ page }) => {
  await login(page, USERS.reviewer);
  await page.goto(battlecardUrl);
  const submit = page.getByRole("button", { name: "Record decision" });
  await expect(submit).toBeDisabled();
  await page.getByRole("radio", { name: "Approve this version" }).check();
  const ack = page.getByRole("checkbox", { name: /qualified expert/ });
  if (await ack.count()) await ack.check();
  await submit.click();
  await expect(page.getByText("Approved: v2")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download approved v2 (Markdown)" }).click(),
  ]);
  const md = await readFile((await download.path())!, "utf8");
  expect(download.suggestedFilename()).toBe("competitive-battlecard-v2.md");
  expect(md).toMatch(/\| Version \| v2 \(/);
  expect(md).toContain("[SYNTHETIC] DataGuard Demo – Unofficial reviewer");
  expect(md).toContain("claim:clm_register");
  expect(md).toContain("competitor-evidence:cev_a_no_register");
  expect(md).toContain("## Sources");
  expect(md).toContain("`src_demo_competitor_a`");
  expect(md).toContain("Human-edited (based on v1)");
  await noHorizontalScroll(page);
  await logout(page);
});

test("a user of another tenant gets 404 for the DataGuard asset URL", async ({ page }) => {
  await login(page, USERS.otherAdmin);
  const res = await page.goto(battlecardUrl);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
  const big = await request.post("/api/workflows", { data: "x".repeat(70_000), headers: { "content-type": "application/json" } });
  expect(big.status()).toBe(413);
});

test("below 768 px: compact menu and stacked tables", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await login(page, USERS.reviewer);
  await page.goto("/approvals");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  // thead is visually hidden; each cell shows its label
  const display = await page.locator("table.stack-table tr").first().evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe("block");
  await noHorizontalScroll(page);
  await ctx.close();
});
