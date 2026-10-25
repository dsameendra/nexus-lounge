import { cookies } from "next/headers";
import { ADMIN_SECRET_MIN, ADMIN_SESSION_SECONDS, DISCORD_ID, checkTotp, parseAdminIds, signAdminRequest, signAdminSession, verifyAdminSession } from "@nexus/shared/admin-token";
import { auth } from "@/auth";
import { serverHttpUrl } from "@/lib/server-api";

export const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-admin" : "admin-session";

function config() {
  const secret = process.env.ADMIN_SECRET ?? "";
  const totp = process.env.ADMIN_TOTP_SECRET ?? "";
  const ids = parseAdminIds(process.env.ADMIN_DISCORD_IDS);
  const enabled = secret.length >= ADMIN_SECRET_MIN && secret !== process.env.AUTH_SECRET && totp.length >= 16 && ids.size > 0;
  return { secret, totp, ids, enabled };
}

export const adminEnabled = () => config().enabled;

// The signed-in Discord user, only if they are on the allowlist (guests never qualify).
export async function adminIdentity() {
  const { enabled, ids } = config();
  if (!enabled) return null;
  const id = (await auth())?.user?.id;
  return id && DISCORD_ID.test(id) && ids.has(id) ? id : null;
}

// Identity plus a valid, unexpired admin cookie from the TOTP step.
export async function adminSession() {
  const sub = await adminIdentity();
  if (!sub) return null;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const claims = token ? verifyAdminSession(token, config().secret) : null;
  return claims?.sub === sub ? sub : null;
}

const failures = new Map<string, { count: number; resetAt: number }>();
const lastStep = new Map<string, number>();

export function loginLocked(sub: string) {
  const entry = failures.get(sub);
  return Boolean(entry && entry.resetAt > Date.now() && entry.count >= 5);
}

export function recordLoginFailure(sub: string) {
  const now = Date.now();
  const entry = failures.get(sub);
  if (!entry || entry.resetAt < now) failures.set(sub, { count: 1, resetAt: now + 5 * 60_000 });
  else entry.count++;
}

// Verifies a code, refusing a time step that was already used. On success returns the cookie value.
export function verifyLogin(sub: string, code: string) {
  const { totp, secret } = config();
  const step = checkTotp(totp, code.trim());
  if (step === null || step <= (lastStep.get(sub) ?? -1)) return null;
  lastStep.set(sub, step);
  failures.delete(sub);
  return signAdminSession(sub, secret);
}

export const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: ADMIN_SESSION_SECONDS,
};

export async function fetchOverview(sub: string) {
  const token = signAdminRequest(sub, config().secret);
  return fetch(`${serverHttpUrl()}/admin/overview`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
}
