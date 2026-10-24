import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { RoomInfo } from "@nexus/shared";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

interface StoredRoom {
  info: RoomInfo;
  passwordHash?: { salt: Buffer; hash: Buffer };
}

const rooms = new Map<string, StoredRoom>();

function newId() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function hashPassword(password: string, salt: Buffer) {
  return scryptSync(password, salt, 32);
}

export function createRoom(hostId: string, password?: string): RoomInfo {
  let id = newId();
  while (rooms.has(id)) id = newId();
  const info: RoomInfo = { id, hostId, controllerIds: [], createdAt: Date.now(), hasPassword: Boolean(password) };
  const salt = randomBytes(16);
  rooms.set(id, { info, passwordHash: password ? { salt, hash: hashPassword(password, salt) } : undefined });
  return info;
}

export function getRoom(id: string) {
  return rooms.get(id)?.info;
}

export function checkRoomAccess(id: string, userId: string, password: string | undefined) {
  const room = rooms.get(id);
  if (!room) return "not_found" as const;
  if (!room.passwordHash || room.info.hostId === userId) return "ok" as const;
  if (!password) return "password_required" as const;
  const candidate = hashPassword(password, room.passwordHash.salt);
  return timingSafeEqual(candidate, room.passwordHash.hash) ? ("ok" as const) : ("wrong_password" as const);
}
