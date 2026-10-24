import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  sub: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  exp: z.number(),
});
export type SessionPayload = z.infer<typeof payloadSchema>;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function signSessionToken(user: Omit<SessionPayload, "exp">, secret: string, ttlSeconds = 300) {
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds })}`;
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = payloadSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    return parsed.exp > Date.now() / 1000 ? parsed : null;
  } catch {
    return null;
  }
}
