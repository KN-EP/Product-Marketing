import type { Db } from "../db/client";
import { DUMMY_HASH, verifyPassword } from "./password";

export interface LoginIdentity {
  userId: string;
  tenantId: string;
}

const membershipSelect = {
  orderBy: { createdAt: "asc" },
  select: { tenantId: true, tenant: { select: { isDemo: true } } },
} as const;

/**
 * Credentials check for SEEDED DEMO USERS ONLY: the user must have a password
 * hash and every one of their memberships must be in a demo tenant. The tenant
 * for the session comes from the user's Membership, never from input.
 */
export async function authenticateDemoUser(db: Db, email: string, password: string): Promise<LoginIdentity | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, passwordHash: true, memberships: membershipSelect },
  });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) return null;
  return demoIdentity(user.id, user.memberships);
}

/** Identity for the dev-only switcher: same demo-only rule, no password. */
export async function demoIdentityForUser(db: Db, userId: string): Promise<LoginIdentity | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, memberships: membershipSelect },
  });
  return user ? demoIdentity(user.id, user.memberships) : null;
}

function demoIdentity(
  userId: string,
  memberships: { tenantId: string; tenant: { isDemo: boolean } }[],
): LoginIdentity | null {
  const first = memberships[0];
  if (!first || !memberships.every((m) => m.tenant.isDemo)) return null;
  return { userId, tenantId: first.tenantId };
}

/** Demo users listed by the dev-only switcher (demo tenants only). */
export function listDemoUsers(db: Db) {
  return db.membership.findMany({
    where: { tenant: { isDemo: true } },
    orderBy: [{ tenant: { name: "asc" } }, { role: "asc" }],
    select: { role: true, user: { select: { id: true, name: true, email: true } }, tenant: { select: { name: true } } },
  });
}
