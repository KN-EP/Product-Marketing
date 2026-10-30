/**
 * E2E (Playwright, simulated mode, TEST database): station "Use cases & ICP"
 * and station "Release & update" (M12) through the real UI.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { login } from "./helpers";

const USERS = { editor: "editor@dataguard-demo.example", otherAdmin: "admin@other-demo.example" };
const SEEDED_RELEASE = "[SYNTHETIC] Review reminders and bulk export · 2.4";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

let releaseUrl = "";
// One editor session for the whole spec: the login rate limit (per IP + e-mail) is shared with the other specs.
let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await login(page, USERS.editor);
});
test.afterAll(async () => {
  await ctx.close();
});

test("editor defines use cases & ICP on the product", async () => {
  await page.goto("/products");
  await page.getByRole("link", { name: /AI Governance module/ }).first().click();
  await expect(page.getByRole("heading", { name: "Use cases & ICP" })).toBeVisible();
  await page.getByRole("button", { name: /Define use cases & ICP|Generate new use case map/ }).click();
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /Use case map & ICP —/ }).click();
  await expect(page.getByText("Build the AI system inventory").first()).toBeVisible();
  await noHorizontalScroll(page);
});

test("editor opens the release plan and generates the communication plan", async () => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Releases" }).first().click();
  await expect(page).toHaveURL(/\/releases$/);
  await noHorizontalScroll(page);
  await page.getByRole("link", { name: SEEDED_RELEASE }).click();
  await expect(page).toHaveURL(/\/releases\/[a-z0-9_]+$/);
  releaseUrl = page.url();
  await expect(page.getByText("Planned changes are not facts yet")).toBeVisible();
  await page.getByRole("button", { name: "Generate communication plan" }).click();
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /Release communication plan —/ }).click();
  await expect(page.getByText("Owner reminders").first()).toBeVisible();
  await noHorizontalScroll(page);
});

test("editor plans a new release through the form", async () => {
  await page.goto("/releases");
  await page.getByLabel("Release type").selectOption("security_update");
  await page.getByLabel("Release name").fill("Security patch");
  await page.getByLabel("Version").fill("2.4.1");
  await page.getByLabel("Summary").fill("Fixes a security issue in the export.");
  await page.getByLabel(/Changes \(one per line/).fill("Hardened export endpoint");
  await page.getByRole("button", { name: "Add release to the plan" }).click();
  await expect(page).toHaveURL(/\/releases\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Security patch · 2.4.1" })).toBeVisible();
});

test("a user of another tenant gets 404 for the DataGuard release URL", async ({ page: other }) => {
  await login(other, USERS.otherAdmin);
  const res = await other.goto(releaseUrl);
  expect(res?.status()).toBe(404);
});
