/**
 * Registry of every app entry point that accepts a record id, plus every
 * server action. tests/unit/isolation-coverage.test.ts fails when a new route,
 * dynamic page or server action appears that is not listed here, so new entry
 * points cannot silently skip the cross-tenant test (test H).
 */

/** Files under src/app that take a record id → covered by tenant-isolation.test.ts. */
export const ID_ENTRYPOINTS = [
  "src/app/api/assets/[id]/route.ts",
  "src/app/api/claims/[id]/route.ts",
  "src/app/api/sources/[id]/route.ts",
  "src/app/assets/[id]/page.tsx",
] as const;

/**
 * Every exported server action, with how it is covered. None of the M3 actions
 * takes a record id; the tests prove they cannot take a tenant from input.
 */
export const SERVER_ACTIONS: Record<string, string> = {
  "src/app/actions/auth.ts#loginAction": "tenant from Membership; injected tenantId field ignored",
  "src/app/actions/auth.ts#switchDemoUserAction": "tenant from Membership; disabled in production",
  "src/app/actions/auth.ts#logoutAction": "no input",
};
