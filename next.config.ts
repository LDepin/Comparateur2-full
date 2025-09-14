import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // On laisse ESLint pour le dev local, mais on ne bloque pas les builds Vercel
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
