import "server-only";
import { DomainError } from "../../domain/actor";
import { BODY_LIMITS } from "../../lib/security-headers";
import { HttpError, NotFoundError, UnauthenticatedError } from "../errors";

/** Return this from a jsonRoute handler to set a non-200 status. */
export class JsonResult {
  constructor(
    readonly body: unknown,
    readonly status: number = 200,
  ) {}
}

/** Domain errors → HTTP. tenant_mismatch is a 404, like any other miss. */
export function domainStatus(e: DomainError): number {
  switch (e.code) {
    case "tenant_mismatch":
      return 404;
    case "forbidden":
      return 403;
    case "gates_failed":
    case "expert_ack_required":
    case "insufficient_evidence":
      return 422;
    default:
      return 409;
  }
}

/** Maps server-layer errors to HTTP. Cross-tenant and missing ids are both a plain 404. */
export async function jsonRoute(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    return out instanceof JsonResult ? Response.json(out.body, { status: out.status }) : Response.json(out);
  } catch (e) {
    if (e instanceof UnauthenticatedError) return Response.json({ error: "unauthenticated" }, { status: 401 });
    if (e instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    if (e instanceof DomainError && e.code === "tenant_mismatch") return Response.json({ error: "not_found" }, { status: 404 });
    if (e instanceof HttpError) {
      return Response.json({ error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) }, { status: e.status });
    }
    if (e instanceof DomainError) return Response.json({ error: e.code, message: e.message }, { status: domainStatus(e) });
    throw e;
  }
}

/** Reads a JSON body with a hard size limit (413) and parse check (400). */
export async function readJsonBody(req: Request, maxBytes: number = BODY_LIMITS.workflowStartBytes): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes.`);
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Body is not valid JSON.");
  }
}
