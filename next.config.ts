// next.config.ts
import type { NextConfig } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://comparateur2-backend.onrender.com"; // fallback https en prod

const nextConfig: NextConfig = {
  // Ne bloque pas les builds Vercel avec ESLint
  eslint: { ignoreDuringBuilds: true },

  // Rewrites côté Vercel pour appeler directement le backend Render
  async rewrites() {
    return [
      // Routes “publiques” (liens directs)
      { source: "/calendar", destination: `${API_BASE}/calendar` },
      { source: "/search", destination: `${API_BASE}/search` },

      // Routes “/api/*” consommées par le front (SearchClient, ping)
      { source: "/api/calendar", destination: `${API_BASE}/calendar` },
      { source: "/api/search", destination: `${API_BASE}/search` },
      { source: "/api/ping", destination: `${API_BASE}/api/ping` },
    ];
  },

  // (Optionnel) Headers utiles — Vercel sert déjà le bon type, mais ça ne fait pas de mal
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          // Astuce PWA : autorise le SW à scope la racine si besoin
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Tu peux ajouter ici d’autres headers de sécu si souhaité
    ];
  },
};

export default nextConfig;