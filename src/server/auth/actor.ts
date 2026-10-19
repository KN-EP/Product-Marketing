import "server-only";
import { redirect } from "next/navigation";
import type { Actor } from "../../domain/actor";
import { getDb } from "../db";
import { UnauthenticatedError } from "../errors";
import { getSession } from "./session";

/**
 * Resolves the Actor from the session cookie + Membership. Takes no arguments
 * on purpose: tenant and role can never come from the URL, query or body.
 * A session whose (userId, tenantId) has no Membership resolves to null.
 */
export async function getActorOrNull(): Promise<Actor | null> {
  const session = await getSession();
  if (!session.userId || !session.tenantId) return null;
  const membership = await getDb().membership.findUnique({
    where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
    select: { userId: true, tenantId: true, role: true },
  });
  if (!membership) return null;
  return { kind: "human", userId: membership.userId, tenantId: membership.tenantId, role: membership.role };
}

/** For route handlers and server actions: throws UnauthenticatedError. */
export async function getActor(): Promise<Actor> {
  const actor = await getActorOrNull();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/** For pages: redirects to /login. */
export async function requirePageActor(): Promise<Actor> {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  return actor;
}
