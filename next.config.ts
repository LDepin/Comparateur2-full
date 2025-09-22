// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Laisse ESLint actif en dev mais ne bloque pas les builds
  eslint: { ignoreDuringBuilds: true },

  // Proxy côté front vers ton backend Render
  async rewrites() {
    return [
      { source: "/calendar", destination: "https://comparateur2-backend.onrender.com/calendar" },
      { source: "/search",   destination: "https://comparateur2-backend.onrender.com/search" },
    ];
  },
};

export default nextConfig;