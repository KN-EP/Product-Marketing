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

export class UnauthenticatedError extends Error {
  constructor() {
    super("unauthenticated");
    this.name = "UnauthenticatedError";
  }
}
