import path from "node:path";
import type { NextConfig } from "next";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
} catch {}

const config: NextConfig = {
  transpilePackages: ["@nexus/shared"],
};

export default config;
