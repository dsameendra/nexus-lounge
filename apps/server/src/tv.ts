import { randomBytes, timingSafeEqual } from "node:crypto";
import { signSessionToken } from "@nexus/shared/session-token";
import type { TvCredentials, TvPoll } from "@nexus/shared";
import { config } from "./config.ts";
import { createViewerToken } from "./livekit.ts";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 500;

interface Pairing {
  roomId: string;
  secret: string;
  expiresAt: number;
  credentials?: TvCredentials;
}

const pairings = new Map<string, Pairing>();
const attempts = new Map<string, { count: number; resetAt: number }>();

function prune() {
  const now = Date.now();
  for (const [code, pairing] of pairings) if (pairing.expiresAt < now) pairings.delete(code);
  for (const [key, entry] of attempts) if (entry.resetAt < now) attempts.delete(key);
}

export function allowAttempt(key: string, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  if (attempts.size > 5000) prune();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

function newCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function dropPairings(roomId: string) {
  for (const [code, pairing] of pairings) if (pairing.roomId === roomId) pairings.delete(code);
}

export function createPairing(roomId: string) {
  prune();
  if (pairings.size >= MAX_PENDING) return null;
  let code = newCode();
  while (pairings.has(code)) code = newCode();
  const secret = randomBytes(18).toString("hex");
  const expiresAt = Date.now() + TTL_MS;
  pairings.set(code, { roomId, secret, expiresAt });
  return { code, secret, expiresAt };
}

export async function mintCredentials(roomId: string, label: string, ownerId: string): Promise<TvCredentials> {
  const identity = `tv-${randomBytes(6).toString("hex")}`;
  const name = label ? `TV (${label})` : "TV";
  return {
    wsTicket: signSessionToken({ sub: identity, name, image: null, guest: true, room: roomId, tv: true, tvOf: ownerId }, config.AUTH_SECRET, 12 * 60 * 60),
    livekitToken: await createViewerToken(roomId, identity, name),
    livekitUrl: config.LIVEKIT_URL,
  };
}

export async function approvePairing(code: string, roomId: string, label: string, ownerId: string) {
  const pairing = pairings.get(code);
  if (!pairing || pairing.expiresAt < Date.now() || pairing.roomId !== roomId) return false;
  pairing.credentials = await mintCredentials(roomId, label, ownerId);
  return true;
}

export function pollPairing(code: string, secret: string): TvPoll | "invalid" {
  const pairing = pairings.get(code);
  if (!pairing || pairing.expiresAt < Date.now()) return "invalid";
  const expected = Buffer.from(pairing.secret);
  const actual = Buffer.from(secret);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return "invalid";
  if (!pairing.credentials) return { status: "pending" };
  pairings.delete(code);
  return { status: "approved", ...pairing.credentials };
}
