// next.config.ts
import type { NextConfig } from "next";

/**
 * Sicherheit: gemeinsame Header
 */
const securityHeaders = [
  // Verhindert alte IE-Kompatibilitätsmodi
  { key: "X-UA-Compatible", value: "IE=edge" },
  // Minimale Clickjacking-Absicherung
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // MIME-Sniffing verhindern
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Basisschutz gegen Referrer-Leaks
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Einfache Permissions Policy (kannst du bei Bedarf lockern)
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Basis-CSP ohne externe Skriptquellen (anpassen, wenn nötig)
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  /**
   * React/Build Defaults
   */
  reactStrictMode: true,
  swcMinify: true,
  compress: true,
  poweredByHeader: false,

  /**
   * Für Vercel stabil: Lint-Warnungen blockieren den Build nicht.
   * (Typescript-Fehler lassen den Build *weiterhin* fehlschlagen,
   * was ich empfehle. Wenn du das temporär lockern willst,
   * setze `typescript.ignoreBuildErrors: true`.)
   */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  /**
   * Deployment: standalone-Output hilft bei schlanken Deployments
   * (auf Vercel nicht zwingend nötig, aber unschädlich).
   */
  output: "standalone",

  /**
   * Optional: wenn du kein <Image/> mit externen Domains nutzt,
   * brauchst du images gar nicht. Lasse es leer oder trage Domains ein.
   */
  images: {
    // unoptimized: true, // falls du bewusst *kein* Next/Image nutzen willst
    // remotePatterns: [{ protocol: "https", hostname: "…", pathname: "/**" }],
  },

  /**
   * Globale Security-Header
   */
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/(.*)", headers: securityHeaders },
    ];
  },

  /**
   * Bei Bedarf: Weiterleitungen/Rewrite-Beispiele
   */
  // async redirects() {
  //   return [{ source: "/home", destination: "/", permanent: true }];
  // },
  // async rewrites() {
  //   return [{ source: "/healthz", destination: "/api/health" }];
  // },
};

export default nextConfig;