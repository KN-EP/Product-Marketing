import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Typecheck runs separately via `npm run typecheck` (tsc, strict).
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
