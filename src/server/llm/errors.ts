/** LLM-layer errors. Messages never include prompt text, source content or credentials. */
export class LlmError extends Error {
  constructor(
    readonly code:
      | "classification_blocked"
      | "output_invalid"
      | "no_tool_call"
      | "truncated"
      | "refusal"
      | "provider_error"
      | "config",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export class ClassificationBlockedError extends LlmError {
  constructor(message: string) {
    super("classification_blocked", message);
    this.name = "ClassificationBlockedError";
  }
}

export class LlmOutputInvalidError extends LlmError {
  constructor(
    message: string,
    /** Zod issue paths + messages only — no output content. */
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super("output_invalid", message);
    this.name = "LlmOutputInvalidError";
  }
}
