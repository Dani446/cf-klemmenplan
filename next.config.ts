// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint/TS beim Build überspringen (bis alles strikt typisiert ist)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // keine swcMinify-Option mehr!
};

export default nextConfig;