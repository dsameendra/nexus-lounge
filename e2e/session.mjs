import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Signs in without Discord by minting the Auth.js session cookie the app would set.
// AUTH_SECRET comes from the environment, or from the repo's .env when running against a local stack.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, ".env"), "utf8")
        .split("\n")
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

const secret = process.env.AUTH_SECRET_OVERRIDE ?? process.env.AUTH_SECRET ?? readEnvFile().AUTH_SECRET;
let encodeToken;

async function loadEncode() {
  if (encodeToken) return encodeToken;
  const require = createRequire(join(root, "apps/web/package.json"));
  const authCore = dirname(require.resolve("next-auth/package.json"));
  const resolved = createRequire(join(authCore, "package.json")).resolve("@auth/core/jwt");
  ({ encode: encodeToken } = await import(pathToFileURL(resolved).href));
  return encodeToken;
}

export async function mintSession(sub, name) {
  if (!secret) throw new Error("Set AUTH_SECRET (or AUTH_SECRET_OVERRIDE) to the web app's secret.");
  const encode = await loadEncode();
  const salt = process.env.COOKIE_SALT ?? "authjs.session-token";
  const token = await encode({ token: { sub, name, picture: null, email: null }, secret, salt, maxAge: 3600 });
  return { name: salt, value: token, domain: process.env.COOKIE_DOMAIN ?? "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: process.env.COOKIE_SECURE === "1" };
}
