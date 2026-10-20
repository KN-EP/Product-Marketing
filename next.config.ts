import type { NextConfig } from "next";
import { BODY_LIMITS, securityHeaders } from "./src/lib/security-headers";

const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
  experimental: {
    serverActions: { bodySizeLimit: BODY_LIMITS.serverActions },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(dev) }];
  },
};

export default nextConfig;
