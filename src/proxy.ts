import { NextResponse, type NextRequest } from "next/server";
import { BODY_LIMITS } from "./lib/security-headers";

/**
 * Early request-size guard for API routes: a declared body above the limit is
 * rejected with 413 before any route code runs. Route handlers check the
 * actual size again while reading (chunked bodies have no Content-Length).
 */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > BODY_LIMITS.apiBytes) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
