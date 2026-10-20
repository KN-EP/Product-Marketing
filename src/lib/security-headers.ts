/**
 * Security headers for every response (next.config.ts → headers()).
 * CSP note: Next.js App Router injects inline bootstrap scripts, so
 * script-src needs 'unsafe-inline' unless a nonce-based CSP is wired through
 * the proxy (planned hardening). Everything else is locked to 'self';
 * framing is forbidden.
 */
export function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}

/** Request body limits. */
export const BODY_LIMITS = {
  /** Any /api route (enforced in src/proxy.ts from Content-Length, and again while reading). */
  apiBytes: 64 * 1024,
  /** POST /api/workflows JSON body. */
  workflowStartBytes: 16 * 1024,
  /** Server actions (next.config.ts); asset content itself is capped at 256 KB. */
  serverActions: "300kb",
} as const;
