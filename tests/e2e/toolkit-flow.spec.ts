/**
 * E2E (Playwright, simulated mode, TEST database): assets & sales toolkit
 * (M13a + M13b) through the real UI — built on the approved strategy brief,
 * one deliverable per run, the one-pager blocked by gate G11 and
 * corrected with the prepared correction, the ROI argument passing the gates.
 */
import { expect, test, type Page } from "@playwright/test";
import { approveStrategyViaUi, login } from "./helpers";

const USERS = { editor: "editor@nordlicht-demo.example", reviewer: "reviewer@nordlicht-demo.example" };
const SEEDED_CAMPAIGN = "[SYNTHETIC] AI inventory campaign — CISOs DACH";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

async function generate(page: Page, campaignUrl: string, label: string) {
  await page.goto(campaignUrl);
  await page.getByLabel("Deliverable").selectOption({ label });
  // Run starts are rate-limited per user; after the earlier specs, wait for the window instead of failing.
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByRole("button", { name: "Generate deliverable" }).click();
    const limited = page.getByText(/Too many requests\. Try again in (\d+) s\./);
    const outcome = await Promise.race([
      page.waitForURL(/\/workflows\/[a-z0-9]+$/, { timeout: 15_000 }).then(() => "started" as const),
      limited.waitFor({ timeout: 15_000 }).then(() => "limited" as const),
    ]);
    if (outcome === "started") break;
    const seconds = Number(/(\d+) s/.exec((await limited.textContent()) ?? "")?.[1] ?? 10);
    await page.waitForTimeout((seconds + 1) * 1000);
  }
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test("assets & sales toolkit on the approved strategy: one-pager blocked by G11 and corrected; ROI argument passes", async ({ page }) => {
  await login(page, USERS.editor);
  await page.goto("/campaigns");
  await page.getByRole("link", { name: SEEDED_CAMPAIGN }).click();
  await expect(page).toHaveURL(/\/campaigns\/[a-z0-9_]+$/);
  const campaignUrl = page.url();

  await expect(page.getByRole("heading", { name: "3 · Assets & sales toolkit" })).toBeVisible();
  // Runs after the other specs: the strategy may already be approved there. The lock itself is covered by the integration tests (409).
  await noHorizontalScroll(page);
  await approveStrategyViaUi(page, campaignUrl, USERS);

  // One-pager: "40 %" stated as fact without a claim → blocked.
  await generate(page, campaignUrl, "One-pager");
  await page.getByRole("link", { name: /One-pager —/ }).click();
  await expect(page).toHaveURL(/\/assets\/[a-z0-9]+$/);
  const onePagerUrl = page.url();
  await expect(page.getByText("Critical — block approval").first()).toBeVisible();
  await expect(page.getByText("Number without basis: cite an approved claim or mark it as an assumption").first()).toBeVisible();
  await noHorizontalScroll(page);

  // The reviewer cannot approve v1 and requests changes (separate context; the editor stays signed in).
  const ctx = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const reviewer = await ctx.newPage();
  await login(reviewer, USERS.reviewer);
  await reviewer.goto(onePagerUrl);
  await expect(reviewer.getByRole("radio", { name: "Approve this version" })).toBeDisabled();
  await reviewer.getByRole("radio", { name: "Request changes" }).check();
  await reviewer.getByLabel(/Comment/).fill("Mark the 40 % as an assumption or back it with an approved claim.");
  await reviewer.getByRole("button", { name: "Record decision" }).click();
  await expect(reviewer.getByText("changes requested").first()).toBeVisible();
  await ctx.close();

  await page.goto(onePagerUrl);
  await page.getByRole("link", { name: "Create corrected version" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("button", { name: "Load prepared correction (simulated)" }).click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save as new version (based on v1)" }).click();
  await expect(page).toHaveURL(onePagerUrl);
  await expect(page.getByText("Human-edited (based on v1)").first()).toBeVisible();

  // ROI argument: every number rests on a marked assumption → passes the gates.
  await generate(page, campaignUrl, "ROI argument");
  await page.getByRole("link", { name: /ROI argument —/ }).click();
  await expect(page.getByText("Critical — block approval")).toHaveCount(0);
  await expect(page.getByText("25 AI systems in use — replace with the customer's number")).toBeVisible();

  await page.goto(campaignUrl);
  await expect(page.getByRole("link", { name: /One-pager —/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /ROI argument —/ })).toBeVisible();
});
