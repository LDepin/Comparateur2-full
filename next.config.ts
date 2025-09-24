// next.config.ts
import type { NextConfig } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://comparateur2-backend.onrender.com"; // fallback https en prod

const nextConfig: NextConfig = {
  // On ne bloque pas les builds Vercel avec ESLint
  eslint: { ignoreDuringBuilds: true },

  // Rewrites côté Vercel pour appeler directement le backend Render
  async rewrites() {
    return [
      // Routes “publiques”
      { source: "/calendar", destination: `${API_BASE}/calendar` },
      { source: "/search", destination: `${API_BASE}/search` },

      // Routes “/api/*” utilisées par le front (SearchClient, ping)
      { source: "/api/calendar", destination: `${API_BASE}/calendar` },
      { source: "/api/search", destination: `${API_BASE}/search` },
      { source: "/api/ping", destination: `${API_BASE}/api/ping` },
    ];
  },
};

export default nextConfig;