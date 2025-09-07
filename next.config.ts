// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // évite l’avertissement "experimental.typedRoutes"
  typedRoutes: true,

  // redirection propre de la racine vers la page app
  async redirects() {
    return [
      { source: "/", destination: "/search", permanent: true },
    ];
  },
};

export default nextConfig;