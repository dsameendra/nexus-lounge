import path from "node:path";
import type { NextConfig } from "next";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
} catch {}

const config: NextConfig = {
  transpilePackages: ["@nexus/shared"],
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
