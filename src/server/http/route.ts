import "server-only";
import { NotFoundError, UnauthenticatedError } from "../errors";

/** Maps server-layer errors to HTTP. Cross-tenant and missing ids are both a plain 404. */
export async function jsonRoute(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof UnauthenticatedError) return Response.json({ error: "unauthenticated" }, { status: 401 });
    if (e instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
