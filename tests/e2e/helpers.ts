import { expect, type Page } from "@playwright/test";

/** Shared E2E helpers (not a spec file). */
export const PASSWORD = () => process.env.E2E_PASSWORD!;

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(PASSWORD());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * M12: the campaign package needs an approved GTM strategy brief. As editor,
 * generate the brief on the campaign page; the reviewer approves it with expert
 * acknowledgement in a SEPARATE browser context (the editor stays signed in, so
 * the login rate limit is not spent twice); ends on the campaign page.
 */
export async function approveStrategyViaUi(page: Page, campaignUrl: string, users: { reviewer: string }) {
  await page.goto(campaignUrl);
  await page.getByRole("button", { name: /Generate (new strategy brief|GTM strategy brief)/ }).click();
  await expect(page).toHaveURL(/\/workflows\/[a-z0-9]+$/);
  await expect(page.getByText("Completed (outputs await review — not approved)")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: /GTM strategy brief —/ }).first().click();
  await expect(page).toHaveURL(/\/assets\/[a-z0-9]+$/);
  const briefUrl = page.url();

  const ctx = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  const reviewer = await ctx.newPage();
  await login(reviewer, users.reviewer);
  await reviewer.goto(briefUrl);
  await reviewer.getByRole("radio", { name: "Approve this version" }).check();
  await reviewer.getByRole("checkbox", { name: /qualified expert/ }).check();
  await reviewer.getByRole("button", { name: "Record decision" }).click();
  await expect(reviewer.getByText("Approved: v1")).toBeVisible();
  await ctx.close();

  await page.goto(campaignUrl);
}
