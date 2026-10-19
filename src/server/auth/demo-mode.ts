type Env = Record<string, string | undefined>;

/** Credentials login exists for seeded demo users only, and only with DEMO_MODE=true. */
export function isCredentialsLoginEnabled(env: Env = process.env): boolean {
  return env.DEMO_MODE === "true";
}

/**
 * The password-less demo identity switcher. Hard-disabled when
 * NODE_ENV=production, regardless of DEMO_MODE. (Next.js inlines NODE_ENV at
 * build time, so a production build cannot re-enable it at runtime.)
 */
export function isDemoSwitcherEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEMO_MODE === "true";
}
