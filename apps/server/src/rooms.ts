import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { WebSocket } from "ws";
import {
  SCREEN_ID,
  streamKey,
  type MediaSource,
  type Member,
  type PendingRequest,
  type Restriction,
  type RoomInfo,
  type RoomState,
  type ServerMessage,
  type Stream,
} from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { fallbackTitle, fetchTitle } from "./titles.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MAX_STREAMS = 30;
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;

interface Connection {
  member: Member;
  sockets: Set<WebSocket>;
}

interface StoredRoom {
  info: RoomInfo;
  passwordHash?: { salt: Buffer; hash: Buffer };
  streams: Stream[];
  featuredId: string | null;
  connections: Map<string, Connection>;
  restrictions: Map<string, Restriction>;
  pending: Map<string, PendingRequest & { lastSeen: number }>;
  admitted: Set<string>;
  blocked: Map<string, "removed" | "declined">;
  emptySince: number | null;
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
  rooms.set(id, {
    info,
    passwordHash: password ? { salt, hash: hashPassword(password, salt) } : undefined,
    streams: [],
    featuredId: null,
    connections: new Map(),
    restrictions: new Map(),
    pending: new Map(),
    admitted: new Set(),
    blocked: new Map(),
    emptySince: Date.now(),
  });
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

function snapshot(room: StoredRoom, forHost: boolean): RoomState {
  return {
    room: room.info,
    streams: room.streams,
    featuredId: room.featuredId,
    members: Array.from(room.connections.values(), (connection) => connection.member),
    restrictions: Object.fromEntries(room.restrictions),
    pending: forHost ? Array.from(room.pending.values(), ({ lastSeen: _lastSeen, ...request }) => request) : [],
    serverTime: Date.now(),
  };
}

export function broadcast(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const hostPayload = JSON.stringify({ type: "state", state: snapshot(room, true) } satisfies ServerMessage);
  const guestPayload = JSON.stringify({ type: "state", state: snapshot(room, false) } satisfies ServerMessage);
  for (const [userId, connection] of room.connections) {
    const payload = userId === room.info.hostId ? hostPayload : guestPayload;
    for (const socket of connection.sockets) if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

export function connect(roomId: string, user: SessionPayload, socket: WebSocket) {
  const room = rooms.get(roomId);
  if (!room) return "not_found" as const;
  if (room.blocked.get(user.sub) === "removed") return "removed" as const;
  const existing = room.connections.get(user.sub);
  if (existing) {
    existing.sockets.add(socket);
    existing.member.name = user.name;
    existing.member.image = user.image;
  } else {
    room.connections.set(user.sub, {
      member: { id: user.sub, name: user.name, image: user.image, guest: user.guest, watching: null },
      sockets: new Set([socket]),
    });
  }
  room.emptySince = null;
  broadcast(roomId);
  return "ok" as const;
}

export function disconnect(roomId: string, userId: string, socket: WebSocket) {
  const room = rooms.get(roomId);
  const connection = room?.connections.get(userId);
  if (!room || !connection) return;
  connection.sockets.delete(socket);
  if (connection.sockets.size === 0) room.connections.delete(userId);
  if (room.connections.size === 0) room.emptySince = Date.now();
  broadcast(roomId);
}

export function sweepEmptyRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS) rooms.delete(id);
  }
}

type Result = { ok: true } | { ok: false; message: string };
const ok: Result = { ok: true };
const fail = (message: string): Result => ({ ok: false, message });

function isController(room: StoredRoom, userId: string) {
  return room.info.hostId === userId || room.info.controllerIds.includes(userId);
}

function canControl(room: StoredRoom, user: SessionPayload, stream: Stream) {
  return !user.guest && (isController(room, user.sub) || stream.addedBy.id === user.sub);
}

export function addStream(roomId: string, user: SessionPayload, source: MediaSource): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest) return fail("Sign in with Discord to add streams");
  const id = streamKey(source);
  if (room.streams.some((stream) => stream.id === id)) return ok;
  if (room.streams.length >= MAX_STREAMS) return fail("This room has too many streams. Remove one first.");

  const stream: Stream = {
    id,
    source,
    title: fallbackTitle(source),
    addedBy: { id: user.sub, name: user.name },
    addedAt: Date.now(),
    playback: { position: null, playing: false, updatedAt: Date.now() },
  };
  room.streams.push(stream);
  broadcast(roomId);

  void fetchTitle(source).then((title) => {
    if (!title || !room.streams.includes(stream)) return;
    stream.title = title;
    broadcast(roomId);
  });
  return ok;
}

export function removeStream(roomId: string, user: SessionPayload, streamId: string): Result {
  const room = rooms.get(roomId);
  const stream = room?.streams.find((candidate) => candidate.id === streamId);
  if (!room || !stream) return fail("Stream not found");
  if (!canControl(room, user, stream)) return fail("Only the host, controllers or the person who added it can remove this");
  room.streams = room.streams.filter((candidate) => candidate !== stream);
  if (room.featuredId === streamId) room.featuredId = null;
  for (const connection of room.connections.values()) {
    if (connection.member.watching === streamId) connection.member.watching = null;
  }
  broadcast(roomId);
  return ok;
}

export function controlStream(
  roomId: string,
  user: SessionPayload,
  streamId: string,
  action: "play" | "pause" | "seek",
  position: number | null,
): Result {
  const room = rooms.get(roomId);
  const stream = room?.streams.find((candidate) => candidate.id === streamId);
  if (!room || !stream) return fail("Stream not found");
  if (!canControl(room, user, stream)) return fail("You don't have control of this stream");
  if (stream.source.type === "twitch" && stream.source.isLive) return fail("Twitch live streams can't be synced");
  if (action === "seek" && position === null) return fail("Seek needs a position");

  const playback = stream.playback;
  if (action === "play") playback.playing = true;
  if (action === "pause") playback.playing = false;
  if (position !== null) playback.position = position;
  playback.updatedAt = Date.now();
  broadcast(roomId);
  return ok;
}

export function establishStream(roomId: string, streamId: string, position: number): Result {
  const room = rooms.get(roomId);
  const stream = room?.streams.find((candidate) => candidate.id === streamId);
  if (!room || !stream) return fail("Stream not found");
  if (stream.playback.position !== null || (stream.source.type === "twitch" && stream.source.isLive)) return ok;
  stream.playback.position = position;
  stream.playback.updatedAt = Date.now();
  broadcast(roomId);
  return ok;
}

export function featureStream(roomId: string, user: SessionPayload, streamId: string | null): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can choose what the room watches");
  if (streamId !== null && streamId !== SCREEN_ID && !room.streams.some((stream) => stream.id === streamId)) {
    return fail("Stream not found");
  }
  room.featuredId = streamId;
  broadcast(roomId);
  return ok;
}

export function setController(roomId: string, user: SessionPayload, targetId: string, enabled: boolean): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (room.info.hostId !== user.sub) return fail("Only the host can change roles");
  const target = room.connections.get(targetId)?.member;
  if (!target || target.guest || targetId === room.info.hostId) return fail("That person can't be a controller");
  const others = room.info.controllerIds.filter((id) => id !== targetId);
  room.info = { ...room.info, controllerIds: enabled ? [...others, targetId] : others };
  broadcast(roomId);
  return ok;
}

export function setWatching(roomId: string, userId: string, streamId: string | null): Result {
  const room = rooms.get(roomId);
  const connection = room?.connections.get(userId);
  if (!room || !connection) return fail("Room not found");
  if (streamId !== null && streamId !== SCREEN_ID && !room.streams.some((stream) => stream.id === streamId)) return ok;
  if (connection.member.watching === streamId) return ok;
  connection.member.watching = streamId;
  broadcast(roomId);
  return ok;
}

export function micBlocked(roomId: string, userId: string) {
  const restriction = rooms.get(roomId)?.restrictions.get(userId);
  return Boolean(restriction && (restriction.muted || restriction.deafened));
}

export function isGuest(roomId: string, userId: string) {
  return rooms.get(roomId)?.connections.get(userId)?.member.guest ?? false;
}

export function setModeration(
  roomId: string,
  user: SessionPayload,
  targetId: string,
  patch: { muted?: boolean; deafened?: boolean },
): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (room.info.hostId !== user.sub) return fail("Only the room owner can mute or deafen people");
  if (targetId === user.sub) return fail("Use your own controls to mute yourself");
  if (!room.connections.has(targetId) && !room.restrictions.has(targetId)) return fail("That person isn't in the room");

  const current = room.restrictions.get(targetId) ?? { muted: false, deafened: false };
  const next = { muted: patch.muted ?? current.muted, deafened: patch.deafened ?? current.deafened };
  if (next.muted || next.deafened) room.restrictions.set(targetId, next);
  else room.restrictions.delete(targetId);
  broadcast(roomId);
  return ok;
}

export function isMember(roomId: string, userId: string) {
  return rooms.get(roomId)?.connections.has(userId) ?? false;
}

export function requestEntry(roomId: string, user: SessionPayload) {
  const room = rooms.get(roomId);
  if (!room) return "not_found" as const;
  const blocked = room.blocked.get(user.sub);
  if (blocked) return blocked;
  if (!user.guest || room.admitted.has(user.sub)) return "ok" as const;

  const existing = room.pending.get(user.sub);
  if (existing) {
    existing.lastSeen = Date.now();
    existing.name = user.name;
  } else {
    room.pending.set(user.sub, { id: user.sub, name: user.name, image: user.image, requestedAt: Date.now(), lastSeen: Date.now() });
    broadcast(roomId);
  }
  return "pending" as const;
}

export function isAdmitted(roomId: string, user: SessionPayload) {
  const room = rooms.get(roomId);
  return Boolean(room && !room.blocked.has(user.sub) && (!user.guest || room.admitted.has(user.sub)));
}

export function respondToJoin(roomId: string, user: SessionPayload, targetId: string, allow: boolean): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (room.info.hostId !== user.sub) return fail("Only the room owner can let people in");
  if (!room.pending.has(targetId)) return ok;
  room.pending.delete(targetId);
  if (allow) room.admitted.add(targetId);
  else room.blocked.set(targetId, "declined");
  broadcast(roomId);
  return ok;
}

export function kickUser(roomId: string, user: SessionPayload, targetId: string): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (room.info.hostId !== user.sub) return fail("Only the room owner can remove people");
  if (targetId === user.sub) return fail("You can't remove yourself");

  room.blocked.set(targetId, "removed");
  room.admitted.delete(targetId);
  room.pending.delete(targetId);
  room.restrictions.delete(targetId);
  room.info = { ...room.info, controllerIds: room.info.controllerIds.filter((id) => id !== targetId) };

  const connection = room.connections.get(targetId);
  if (connection) {
    room.connections.delete(targetId);
    for (const socket of connection.sockets) {
      socket.send(JSON.stringify({ type: "kicked" } satisfies ServerMessage));
      socket.close(4001, "Removed by the room owner");
    }
  }
  if (room.connections.size === 0) room.emptySince = Date.now();
  broadcast(roomId);
  return ok;
}

export function pruneStalePending() {
  const cutoff = Date.now() - 15_000;
  for (const [roomId, room] of rooms) {
    let changed = false;
    for (const [id, request] of room.pending) {
      if (request.lastSeen < cutoff) {
        room.pending.delete(id);
        changed = true;
      }
    }
    if (changed) broadcast(roomId);
  }
}
