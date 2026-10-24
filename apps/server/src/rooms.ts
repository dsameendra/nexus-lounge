import { randomBytes } from "node:crypto";
import type { RoomInfo } from "@nexus/shared";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const rooms = new Map<string, RoomInfo>();

function newId() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function createRoom(hostId: string): RoomInfo {
  let id = newId();
  while (rooms.has(id)) id = newId();
  const room: RoomInfo = { id, hostId, controllerIds: [], createdAt: Date.now() };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string) {
  return rooms.get(id);
}
