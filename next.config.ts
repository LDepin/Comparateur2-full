import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // permet d’ignorer les erreurs eslint pendant le build (Vercel)
  },
};

export default nextConfig;