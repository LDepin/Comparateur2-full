// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ⚠️ surtout pas d'`output: "export"` ici (ça casserait les routes /api)
  // ⚠️ et aucun rewrites() pour /api/*
};

export default nextConfig;
