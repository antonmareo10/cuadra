import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Recorded runs and sample documents are read from disk by route handlers.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*", "./recordings/**/*"],
  },
};

export default nextConfig;
