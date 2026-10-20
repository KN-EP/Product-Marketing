/**
 * Central logger. Everything logged by server code goes through sanitize():
 * connection strings, URL credentials, API keys / bearer tokens / JWTs,
 * key=value secrets and e-mail addresses are redacted; fields that carry
 * prompt or content text are dropped; long strings are truncated.
 */

const MAX_STRING = 500;
const MAX_DEPTH = 6;

/** Field names whose values are prompt/content text — never logged. */
const CONTENT_KEYS = /^(prompt|system|user|messages?|content|text|excerpt|input|output|completion|body)$/i;
/** Field names whose values are secrets — never logged. */
const SECRET_KEYS = /(password|passwd|secret|token|api[-_]?key|authorization|cookie|session|connection[-_]?string|database[-_]?url)/i;

const RULES: [RegExp, string][] = [
  // any scheme://user:pass@host… (postgres, redis, http with credentials …)
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@'"]*:[^\s/@'"]*@[^\s'"]+/gi, "[redacted-url]"],
  // database URLs even without credentials
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+/gi, "[redacted-url]"],
  [/\bsk-ant-[A-Za-z0-9_-]+/g, "[redacted-key]"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+/g, "[redacted-key]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]"],
  [/\b(password|passwd|secret|token|api[-_]?key)\s*[=:]\s*[^\s&,;'"]+/gi, "$1=[redacted]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
];

export function sanitizeString(s: string): string {
  let out = s;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…[truncated]` : out;
}

export function sanitize(value: unknown, depth = 0, key?: string): unknown {
  if (key !== undefined && SECRET_KEYS.test(key)) return "[redacted]";
  if (key !== undefined && CONTENT_KEYS.test(key)) return "[redacted-content]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
  if (value instanceof Error) {
    // Name + sanitized message only; stacks can embed request data.
    return { name: value.name, message: sanitizeString(value.message) };
  }
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v, depth + 1, k)]));
  }
  return String(value);
}

type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = { level, msg: sanitizeString(msg), ...(meta ? { meta: sanitize(meta) } : {}), at: new Date().toISOString() };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.info(text);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
