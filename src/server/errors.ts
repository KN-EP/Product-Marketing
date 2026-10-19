/**
 * Server-layer errors. NotFoundError is deliberately used for BOTH "does not
 * exist" and "exists in another tenant", so callers cannot probe for ids.
 */
export class NotFoundError extends Error {
  constructor(readonly entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

/** A request-level error with an HTTP status and a stable, non-sensitive code. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 413 | 422 | 429,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Optimistic-concurrency miss: the row changed state since it was read. */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, "conflict", message);
    this.name = "ConflictError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("unauthenticated");
    this.name = "UnauthenticatedError";
  }
}
