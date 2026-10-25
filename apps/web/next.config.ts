import path from "node:path";
import type { NextConfig } from "next";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
} catch {}

const config: NextConfig = {
  transpilePackages: ["@nexus/shared"],
  async redirects() {
    return ["www.nexuslounge.party", "web-production-795645.up.railway.app"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://nexuslounge.party/:path*",
      permanent: true,
    }));
  },
  async headers() {
    const adminHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Vary", value: "Cookie" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              key: "Content-Security-Policy",
              value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            },
          ]
        : []),
    ];
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/admin/:path*", headers: adminHeaders },
      { source: "/admin", headers: adminHeaders },
      { source: "/api/admin/:path*", headers: adminHeaders },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
