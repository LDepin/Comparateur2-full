// next.config.ts
import type { NextConfig } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

const nextConfig: NextConfig = {
  // On ne bloque pas les builds Vercel avec ESLint
  eslint: { ignoreDuringBuilds: true },

  // Rewrites côté Vercel pour appeler directement le backend Render
  async rewrites() {
    return [
      { source: "/calendar", destination: `${API_BASE}/calendar` },
      { source: "/search", destination: `${API_BASE}/search` },
      // Utile pour un smoke test simple côté Vercel
      { source: "/api/ping", destination: `${API_BASE}/api/ping` },
    ];
  },
};

export default nextConfig;