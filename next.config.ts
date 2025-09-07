// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [{ source: "/", destination: "/search", permanent: false }];
  },
};

export default nextConfig;