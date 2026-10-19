/**
 * Registry of every app entry point that accepts a record id, plus every
 * server action. tests/unit/isolation-coverage.test.ts fails when a new route,
 * dynamic page or server action appears that is not listed here, so new entry
 * points cannot silently skip the cross-tenant test (test H).
 */

/** Files under src/app that take a record id (or start work) → covered by the integration tests. */
export const ID_ENTRYPOINTS = [
  "src/app/api/assets/[id]/route.ts", // tenant-isolation.test.ts
  "src/app/api/claims/[id]/route.ts", // tenant-isolation.test.ts
  "src/app/api/sources/[id]/route.ts", // tenant-isolation.test.ts
  "src/app/api/workflows/[id]/route.ts", // workflow.test.ts
  "src/app/api/workflows/route.ts", // workflow.test.ts (foreign product/persona/... ids → 404)
  "src/app/assets/[id]/page.tsx", // tenant-isolation.test.ts
] as const;

/** Every exported server action, with how it is covered. */
export const SERVER_ACTIONS: Record<string, string> = {
  "src/app/actions/auth.ts#loginAction": "tenant from Membership; injected tenantId field ignored",
  "src/app/actions/auth.ts#switchDemoUserAction": "tenant from Membership; disabled in production",
  "src/app/actions/auth.ts#logoutAction": "no input",
  "src/app/actions/review.ts#submitForReviewAction": "workflow.test.ts: foreign asset id → 404",
  "src/app/actions/review.ts#decideAction": "workflow.test.ts: foreign asset id → 404",
  "src/app/actions/review.ts#createDraftVersionAction": "workflow.test.ts: foreign asset id → 404",
  "src/app/actions/review.ts#exportMarkdownAction": "workflow.test.ts: foreign asset id → 404",
  "src/app/actions/review.ts#transitionClaimAction": "workflow.test.ts: foreign claim id → 404",
  "src/app/actions/workflow.ts#retryWorkflowRunAction": "workflow.test.ts: foreign run id → 404",
};
