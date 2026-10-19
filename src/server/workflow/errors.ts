import { DomainError } from "../../domain/actor";
import { HttpError, NotFoundError } from "../errors";
import { LlmError, LlmOutputInvalidError } from "../llm/errors";

export type WorkflowLimitCode = "cost_cap" | "cost_unenforceable" | "concurrency_limit" | "max_attempts";

export class WorkflowLimitError extends HttpError {
  constructor(
    readonly limit: WorkflowLimitCode,
    message: string,
  ) {
    super(limit === "concurrency_limit" ? 429 : 409, limit, message);
    this.name = "WorkflowLimitError";
  }
}

const MAX_ERROR_CHARS = 500;

/**
 * The only text ever stored in WorkflowRun.error. Built from error codes and
 * messages we write ourselves; unknown errors (driver, network, SDK internals)
 * collapse to a generic code so prompts, source text, SQL or connection
 * details can never end up in the database or the API.
 */
export function sanitizeError(e: unknown): string {
  let text: string;
  if (e instanceof LlmOutputInvalidError) {
    const paths = e.issues.slice(0, 5).map((i) => i.path || "(root)");
    text = `${e.code}: ${e.message}${paths.length ? ` Invalid fields: ${paths.join(", ")}` : ""}`;
  } else if (e instanceof LlmError) {
    text = `${e.code}: ${e.message}`;
  } else if (e instanceof HttpError) {
    text = `${e.code}: ${e.message}`;
  } else if (e instanceof DomainError) {
    text = `${e.code}: ${e.message}`;
  } else if (e instanceof NotFoundError) {
    text = `not_found: ${e.entity} not found`;
  } else {
    text = "internal_error: The run failed unexpectedly. See server logs.";
  }
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS - 1)}…` : text;
}
