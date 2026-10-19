import "server-only";
import { z } from "zod";
import { DomainError, type Actor } from "../../domain/actor";
import { getActor } from "../auth/actor";
import { HttpError, NotFoundError, UnauthenticatedError } from "../errors";
import { domainStatus } from "./route";

/**
 * Server actions return HTTP-like results instead of throwing, so a foreign or
 * missing id is a plain { status: 404 } — same as the API routes.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; message?: string; details?: unknown };

export async function runAction<T>(fn: (actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const actor = await getActor();
    return { ok: true, data: await fn(actor) };
  } catch (e) {
    if (e instanceof UnauthenticatedError) return { ok: false, status: 401, error: "unauthenticated" };
    if (e instanceof NotFoundError) return { ok: false, status: 404, error: "not_found" };
    if (e instanceof DomainError) {
      const status = domainStatus(e);
      return status === 404
        ? { ok: false, status, error: "not_found" }
        : { ok: false, status, error: e.code, message: e.message };
    }
    if (e instanceof HttpError) {
      return { ok: false, status: e.status, error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) };
    }
    if (e instanceof z.ZodError) {
      return { ok: false, status: 400, error: "invalid_input", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
    }
    throw e;
  }
}
