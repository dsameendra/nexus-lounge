import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export const DISCORD_ID = /^\d{17,20}$/;
export const ADMIN_SECRET_MIN = 32;

export function parseAdminIds(raw: string | undefined) {
  return new Set((raw ?? "").split(",").map((id) => id.trim()).filter((id) => DISCORD_ID.test(id)));
}

const headerSchema = z.object({ alg: z.literal("HS256"), typ: z.literal("JWT") }).strict();

function verify<T extends z.ZodType>(token: string, secret: string, schema: T, allowedKeys?: string[], now = Date.now() / 1000): z.infer<T> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    headerSchema.parse(JSON.parse(Buffer.from(header, "base64url").toString()));
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    if (allowedKeys && !Object.keys(raw).every((key) => allowedKeys.includes(key))) return null;
    const claims = schema.parse(raw);
    const { iat, exp } = claims as { iat: number; exp: number };
    if (exp <= now - 5 || iat > now + 5) return null;
    return claims;
  } catch {
    return null;
  }
}

function make(claims: Record<string, unknown>, secret: string, ttlSeconds: number) {
  const iat = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...claims, iat, exp: iat + ttlSeconds })}`;
  return `${body}.${sign(body, secret)}`;
}

// Short-lived request token the web app sends to the realtime server.
export const ROOM_ID = /^[a-z0-9]{8}$/;
export const MEMBER_REF = /^[A-Za-z0-9_-]{22}$/;

const actSchema = z.discriminatedUnion("act", [
  z.object({ act: z.literal("view") }),
  z.object({ act: z.literal("close"), room: z.string().regex(ROOM_ID) }),
  z.object({ act: z.literal("remove"), room: z.string().regex(ROOM_ID), ref: z.string().regex(MEMBER_REF) }),
]);
export type AdminAct = z.infer<typeof actSchema>;

const baseSchema = z.object({
  iss: z.literal("nexus-web"),
  aud: z.literal("admin"),
  sub: z.string().regex(DISCORD_ID),
  jti: z.uuid(),
  iat: z.number(),
  exp: z.number(),
});

const requestSchema = z
  .intersection(baseSchema, actSchema)
  .refine((claims) => claims.exp - claims.iat <= 120);

export type AdminRequestClaims = z.infer<typeof requestSchema>;

export function signAdminRequest(sub: string, secret: string, act: AdminAct = { act: "view" }) {
  return make({ iss: "nexus-web", aud: "admin", sub, jti: randomUUID(), ...act }, secret, 60);
}

// Opaque per-room handle for a member, so the admin UI never sees Discord IDs.
export function memberRef(secret: string, roomId: string, memberId: string) {
  return createHmac("sha256", secret).update(`ref:${roomId}:${memberId}`).digest("base64url").slice(0, 22);
}

export function csrfToken(secret: string, sessionCookie: string) {
  return createHmac("sha256", secret).update(`csrf:${sessionCookie}`).digest("base64url");
}

export function verifyAdminRequest(token: string, secret: string) {
  return verify(token, secret, requestSchema, ["iss", "aud", "sub", "jti", "iat", "exp", "act", "room", "ref"]);
}

// Browser cookie granting access to /admin after the TOTP check.
const cookieSchema = z
  .object({ iss: z.literal("nexus-web"), aud: z.literal("admin-session"), sub: z.string().regex(DISCORD_ID), iat: z.number(), exp: z.number() })
  .strict();

export const ADMIN_SESSION_SECONDS = 30 * 60;

export function signAdminSession(sub: string, secret: string) {
  return make({ iss: "nexus-web", aud: "admin-session", sub }, secret, ADMIN_SESSION_SECONDS);
}

export function verifyAdminSession(token: string, secret: string) {
  return verify(token, secret, cookieSchema);
}

// TOTP (RFC 6238): SHA-1, 6 digits, 30 second steps.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(value: string) {
  let bits = "";
  for (const char of value.replace(/[\s=-]/g, "").toUpperCase()) {
    const index = B32.indexOf(char);
    if (index === -1) throw new Error("invalid base32");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secretBase32: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const value = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(value % 1_000_000).padStart(6, "0");
}

// Returns the matching time step (so the caller can refuse to reuse it) or null.
export function checkTotp(secretBase32: string, code: string, now = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  let match: number | null = null;
  for (let delta = -window; delta <= window; delta++) {
    const expected = Buffer.from(totpCode(secretBase32, current + delta));
    if (timingSafeEqual(expected, Buffer.from(code))) match = current + delta;
  }
  return match;
}
