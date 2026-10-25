import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { WebSocket } from "ws";
import {
  LIMITS,
  defaultRoomSettings,
  isScreenId,
  isQueueable,
  type PlaylistItem,
  type PlaylistSummary,
  type QueueItem,
  type RoomSettings,
  streamKey,
  type MediaSource,
  type Member,
  type PendingRequest,
  type ReactionEmoji,
  type Restriction,
  type RoomInfo,
  type RoomState,
  type ServerMessage,
  type Stream,
} from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { fetchPlaylist } from "./playlists.ts";
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
  queue: QueueItem[];
  playlists: { summary: PlaylistSummary; items: PlaylistItem[] }[];
  featuredId: string | null;
  connections: Map<string, Connection>;
  restrictions: Map<string, Restriction>;
  pending: Map<string, PendingRequest & { lastSeen: number }>;
  admitted: Set<string>;
  known: Set<string>;
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

export function createRoom(hostId: string, password?: string, name = ""): RoomInfo {
  let id = newId();
  while (rooms.has(id)) id = newId();
  const info: RoomInfo = {
    id,
    name,
    settings: { ...defaultRoomSettings },
    hostId,
    controllerIds: [],
    createdAt: Date.now(),
    hasPassword: Boolean(password),
  };
  const salt = randomBytes(16);
  rooms.set(id, {
    info,
    passwordHash: password ? { salt, hash: hashPassword(password, salt) } : undefined,
    streams: [],
    queue: [],
    playlists: [],
    featuredId: null,
    connections: new Map(),
    restrictions: new Map(),
    pending: new Map(),
    admitted: new Set(),
    known: new Set(),
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
    queue: room.queue,
    playlists: room.playlists.map((playlist) => playlist.summary),
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
      member: { id: user.sub, name: user.name, image: user.image, guest: user.guest, deafened: false, watching: null, tvOf: user.tv ? (user.tvOf ?? null) : null },
      sockets: new Set([socket]),
    });
  }
  room.known.add(user.sub);
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
  if (streamId !== null && !isScreenId(streamId) && !room.streams.some((stream) => stream.id === streamId)) {
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
  if (streamId !== null && !isScreenId(streamId) && !room.streams.some((stream) => stream.id === streamId)) return ok;
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

type EntryDecision = "ok" | "admit" | "pending" | "locked" | "closed" | "removed" | "declined" | "not_found";

function evaluateEntry(room: StoredRoom | undefined, user: SessionPayload): EntryDecision {
  if (!room) return "not_found";
  const blocked = room.blocked.get(user.sub);
  if (blocked) return blocked;
  if (user.sub === room.info.hostId) return "ok";

  const returning = room.known.has(user.sub) || room.admitted.has(user.sub);
  if (room.info.settings.locked && !returning) return "locked";
  if (!user.guest || returning) return "ok";
  if (room.info.settings.guests === "closed") return "closed";
  return room.info.settings.guests === "open" ? "admit" : "pending";
}

export function checkEntry(roomId: string, user: SessionPayload) {
  const decision = evaluateEntry(rooms.get(roomId), user);
  return decision === "admit" ? ("ok" as const) : decision;
}

export function requestEntry(roomId: string, user: SessionPayload) {
  const room = rooms.get(roomId);
  const decision = evaluateEntry(room, user);
  if (!room) return "not_found" as const;
  if (decision === "admit") {
    room.admitted.add(user.sub);
    return "ok" as const;
  }
  if (decision !== "pending") return decision;

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

export function updateSettings(roomId: string, user: SessionPayload, patch: Partial<RoomSettings> & { name?: string }): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (room.info.hostId !== user.sub) return fail("Only the room owner can change room settings");

  const { name, ...settingsPatch } = patch;
  const defined = Object.fromEntries(Object.entries(settingsPatch).filter(([, value]) => value !== undefined));
  const settings = { ...room.info.settings, ...defined } as RoomSettings;
  room.info = { ...room.info, settings, name: name ?? room.info.name };

  if (settings.guests === "open") {
    for (const id of room.pending.keys()) room.admitted.add(id);
    room.pending.clear();
  } else if (settings.guests === "closed") {
    room.pending.clear();
  }
  broadcast(roomId);
  return ok;
}

export function moveStream(roomId: string, user: SessionPayload, streamId: string, direction: "up" | "down" | "next"): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can reorder the queue");
  const index = room.streams.findIndex((stream) => stream.id === streamId);
  if (index === -1) return fail("Stream not found");

  let target = index;
  if (direction === "up") target = index - 1;
  if (direction === "down") target = index + 1;
  if (direction === "next") {
    const featuredIndex = room.streams.findIndex((stream) => stream.id === room.featuredId);
    target = featuredIndex === -1 ? 0 : featuredIndex + 1;
    if (index < target) target -= 1;
  }
  if (target < 0 || target >= room.streams.length || target === index) return ok;

  const [moved] = room.streams.splice(index, 1);
  room.streams.splice(target, 0, moved!);
  broadcast(roomId);
  return ok;
}

export function advanceQueue(roomId: string, user: SessionPayload, fromStreamId: string): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can advance the queue");
  if (!room.info.settings.autoplayNext || room.featuredId !== fromStreamId) return ok;

  const queued = room.queue.shift();
  if (queued) {
    startQueued(room, queued);
    broadcast(roomId);
    return ok;
  }

  const index = room.streams.findIndex((stream) => stream.id === fromStreamId);
  const next = room.streams[index + 1];
  if (index === -1 || !next) return ok;

  room.featuredId = next.id;
  const twitchLive = next.source.type === "twitch" && next.source.isLive;
  next.playback = twitchLive
    ? { position: null, playing: false, updatedAt: Date.now() }
    : { position: next.source.isLive ? null : 0, playing: true, updatedAt: Date.now() };
  broadcast(roomId);
  return ok;
}

const reactionHistory = new Map<string, number[]>();
const REACTION_LIMIT = 8;
const REACTION_WINDOW_MS = 5000;

export function sendReaction(roomId: string, user: SessionPayload, emoji: ReactionEmoji): Result {
  const room = rooms.get(roomId);
  if (!room || !room.connections.has(user.sub)) return fail("Join the room first");
  if (!room.info.settings.reactions) return fail("Reactions are turned off in this room");

  const key = `${roomId}:${user.sub}`;
  const now = Date.now();
  const recent = (reactionHistory.get(key) ?? []).filter((time) => now - time < REACTION_WINDOW_MS);
  if (recent.length >= REACTION_LIMIT) return ok;
  reactionHistory.set(key, [...recent, now]);

  const payload = JSON.stringify({ type: "reaction", id: randomBytes(6).toString("hex"), emoji, from: { id: user.sub, name: user.name } } satisfies ServerMessage);
  for (const connection of room.connections.values()) {
    for (const socket of connection.sockets) if (socket.readyState === socket.OPEN) socket.send(payload);
  }
  return ok;
}

export function pruneReactionHistory() {
  const cutoff = Date.now() - REACTION_WINDOW_MS;
  for (const [key, times] of reactionHistory) {
    const recent = times.filter((time) => time > cutoff);
    if (recent.length === 0) reactionHistory.delete(key);
    else reactionHistory.set(key, recent);
  }
}

export function setVoiceState(roomId: string, userId: string, deafened: boolean): Result {
  const room = rooms.get(roomId);
  const connection = room?.connections.get(userId);
  if (!room || !connection) return fail("Room not found");
  if (connection.member.deafened === deafened) return ok;
  connection.member.deafened = deafened;
  broadcast(roomId);
  return ok;
}

export function canShareScreen(roomId: string, user: { sub: string; guest: boolean }) {
  const room = rooms.get(roomId);
  if (!room || user.guest) return false;
  return room.info.settings.sharing === "everyone" || isController(room, user.sub);
}

export function publishInputs(roomId: string, user: { sub: string; guest: boolean }) {
  return { guest: user.guest, micBlocked: micBlocked(roomId, user.sub), canShare: canShareScreen(roomId, user) };
}

export function connectedUsers(roomId: string) {
  const room = rooms.get(roomId);
  return room ? Array.from(room.connections.values(), (connection) => ({ sub: connection.member.id, guest: connection.member.guest })) : [];
}

export function checkStopShare(roomId: string, user: SessionPayload, targetId: string): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can stop someone's screen share");
  if (targetId === room.info.hostId && user.sub !== room.info.hostId) return fail("Only the room owner can stop the owner's screen share");
  if (!room.connections.has(targetId)) return fail("That person isn't in the room");
  return ok;
}

const newQueueId = () => randomBytes(6).toString("hex");

function startQueued(room: StoredRoom, item: QueueItem) {
  const id = streamKey(item.source);
  let stream = room.streams.find((candidate) => candidate.id === id);
  if (!stream) {
    while (room.streams.length >= MAX_STREAMS) {
      const index = room.streams.findIndex((candidate) => candidate.id !== room.featuredId);
      if (index === -1) break;
      room.streams.splice(index, 1);
    }
    stream = {
      id,
      source: item.source,
      title: item.title,
      addedBy: item.addedBy,
      addedAt: Date.now(),
      playback: { position: 0, playing: true, updatedAt: Date.now() },
    };
    room.streams.push(stream);
  }
  stream.playback = { position: 0, playing: true, updatedAt: Date.now() };
  room.featuredId = id;
  for (const connection of room.connections.values()) {
    if (connection.member.watching && !isScreenId(connection.member.watching) && connection.member.watching !== id && !room.streams.some((s) => s.id === connection.member.watching)) {
      connection.member.watching = null;
    }
  }
}

function canQueue(user: SessionPayload) {
  return !user.guest;
}

function pushQueue(room: StoredRoom, entries: QueueItem[], position: "end" | "next") {
  if (room.queue.length + entries.length > LIMITS.queue) return false;
  if (position === "next") room.queue.unshift(...entries);
  else room.queue.push(...entries);
  return true;
}

export async function addPlaylist(roomId: string, user: SessionPayload, listId: string): Promise<Result> {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (!canQueue(user)) return fail("Sign in with Discord to add playlists");
  if (room.playlists.some((playlist) => playlist.summary.id === listId)) return ok;
  if (room.playlists.length >= LIMITS.playlists) return fail("This room has too many playlists. Remove one first.");
  const loaded = await fetchPlaylist(listId);
  if (!loaded) return fail("Couldn't load that playlist. It may be private or empty.");
  if (!rooms.has(roomId) || room.playlists.some((playlist) => playlist.summary.id === listId) || room.playlists.length >= LIMITS.playlists) return ok;
  room.playlists.push({
    summary: { id: listId, title: loaded.title, count: loaded.items.length, addedBy: { id: user.sub, name: user.name }, addedAt: Date.now() },
    items: loaded.items,
  });
  broadcast(roomId);
  return ok;
}

export function removePlaylist(roomId: string, user: SessionPayload, listId: string): Result {
  const room = rooms.get(roomId);
  const playlist = room?.playlists.find((candidate) => candidate.summary.id === listId);
  if (!room || !playlist) return fail("Playlist not found");
  if (!isController(room, user.sub) && playlist.summary.addedBy.id !== user.sub) return fail("Only the host, controllers or the person who added it can remove this");
  room.playlists = room.playlists.filter((candidate) => candidate !== playlist);
  broadcast(roomId);
  return ok;
}

export function playlistItems(roomId: string, listId: string): PlaylistItem[] | null {
  return rooms.get(roomId)?.playlists.find((playlist) => playlist.summary.id === listId)?.items ?? null;
}

export function queuePlaylist(roomId: string, user: SessionPayload, listId: string, videoIds: string[] | undefined, position: "end" | "next"): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (!canQueue(user)) return fail("Sign in with Discord to add to the queue");
  const playlist = room.playlists.find((candidate) => candidate.summary.id === listId);
  if (!playlist) return fail("Playlist not found");
  const wanted = videoIds ? new Set(videoIds) : null;
  const picked = playlist.items.filter((item) => !wanted || wanted.has(item.id));
  if (picked.length === 0) return fail("Pick at least one video");
  const entries: QueueItem[] = picked.map((item) => ({
    id: newQueueId(),
    source: { type: "youtube", id: item.id, isLive: false },
    title: item.title,
    addedBy: { id: user.sub, name: user.name },
  }));
  if (!pushQueue(room, entries, position)) return fail(`The queue is full (${LIMITS.queue} videos max)`);
  broadcast(roomId);
  return ok;
}

export function queueStream(roomId: string, user: SessionPayload, streamId: string, position: "end" | "next"): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (!canQueue(user)) return fail("Sign in with Discord to add to the queue");
  const stream = room.streams.find((candidate) => candidate.id === streamId);
  if (!stream) return fail("Stream not found");
  if (!isQueueable(stream.source)) return fail("Live streams can't be queued");
  const entry: QueueItem = { id: newQueueId(), source: stream.source, title: stream.title, addedBy: { id: user.sub, name: user.name } };
  if (!pushQueue(room, [entry], position)) return fail(`The queue is full (${LIMITS.queue} videos max)`);
  broadcast(roomId);
  return ok;
}

export function removeQueued(roomId: string, user: SessionPayload, queueId: string): Result {
  const room = rooms.get(roomId);
  const item = room?.queue.find((candidate) => candidate.id === queueId);
  if (!room || !item) return fail("That item is no longer in the queue");
  if (!isController(room, user.sub) && item.addedBy.id !== user.sub) return fail("Only the host, controllers or the person who queued it can remove this");
  room.queue = room.queue.filter((candidate) => candidate !== item);
  broadcast(roomId);
  return ok;
}

export function moveQueued(roomId: string, user: SessionPayload, queueId: string, direction: "up" | "down" | "top"): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can reorder the queue");
  const index = room.queue.findIndex((candidate) => candidate.id === queueId);
  if (index === -1) return fail("That item is no longer in the queue");
  const target = direction === "up" ? index - 1 : direction === "down" ? index + 1 : 0;
  if (target < 0 || target >= room.queue.length || target === index) return ok;
  const [moved] = room.queue.splice(index, 1);
  room.queue.splice(target, 0, moved!);
  broadcast(roomId);
  return ok;
}

export function clearQueue(roomId: string, user: SessionPayload): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can clear the queue");
  room.queue = [];
  broadcast(roomId);
  return ok;
}

export function playQueuedNow(roomId: string, user: SessionPayload, queueId: string): Result {
  const room = rooms.get(roomId);
  if (!room) return fail("Room not found");
  if (user.guest || !isController(room, user.sub)) return fail("Only the host or controllers can choose what the room watches");
  const index = room.queue.findIndex((candidate) => candidate.id === queueId);
  if (index === -1) return fail("That item is no longer in the queue");
  const [item] = room.queue.splice(index, 1);
  startQueued(room, item!);
  broadcast(roomId);
  return ok;
}
