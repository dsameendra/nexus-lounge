import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { defaultRoomSettings, expectedPosition, playlistItemSchema, playlistSummarySchema, queueItemSchema, restrictionSchema, roomInfoSchema, streamSchema } from "@nexus/shared";
import { log } from "./log.ts";
import { exportRooms, importRooms, type SavedRoom } from "./rooms.ts";
import { onShutdown } from "./shutdown.ts";

export const SNAPSHOT_VERSION = 1;
const INTERVAL_MS = 30_000;
// Players keep running while the server is away, so a playing clock is kept as it was for a normal restart.
// After a long outage nobody's player is still where the clock would put it: pause at the moment of the snapshot.
export const STALE_CLOCK_MS = 10 * 60 * 1000;

// JSON has no Map, Set or Buffer; they are written as single-key tagged objects.
export function encode(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (value instanceof Map) return { $map: Array.from(value, ([key, item]) => [encode(key), encode(item)]) };
  if (value instanceof Set) return { $set: Array.from(value, encode) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  return value;
}

export function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value);
  if (entries.length === 1) {
    const [tag, inner] = entries[0]!;
    if (tag === "$buffer" && typeof inner === "string") return Buffer.from(inner, "base64");
    if (tag === "$set" && Array.isArray(inner)) return new Set(inner.map(decode));
    if (tag === "$map" && Array.isArray(inner) && inner.every((pair) => Array.isArray(pair) && pair.length === 2)) {
      return new Map(inner.map(([key, item]: unknown[]) => [decode(key), decode(item)]));
    }
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, decode(item)]));
}

// Drops the items that no longer validate instead of the whole room.
const list = <T extends z.ZodType>(item: T) =>
  z.array(z.unknown()).transform((items) => items.flatMap((candidate) => {
    const parsed = item.safeParse(candidate);
    return parsed.success ? [parsed.data as z.output<T>] : [];
  }));

const buffer = z.custom<Buffer>((value) => Buffer.isBuffer(value));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Loose on purpose: fields this file doesn't know (added to StoredRoom later) pass through untouched.
const savedRoomSchema = z
  .looseObject({
    info: z.preprocess((info) => (isRecord(info) && isRecord(info.settings) ? { ...info, settings: { ...defaultRoomSettings, ...info.settings } } : info), roomInfoSchema),
    passwordHash: z.object({ salt: buffer, hash: buffer }).optional(),
    streams: list(streamSchema),
    queue: list(queueItemSchema),
    playlists: list(z.object({ summary: playlistSummarySchema, items: list(playlistItemSchema) })),
    featuredId: z.string().nullable(),
    restrictions: z.map(z.string(), restrictionSchema),
    admitted: z.set(z.string()),
    known: z.set(z.string()),
    blocked: z.map(z.string(), z.enum(["removed", "declined"])),
  })
  .refine((room) => room.info.hasPassword === Boolean(room.passwordHash), "password flag and hash disagree");

const fileSchema = z.object({ version: z.literal(SNAPSHOT_VERSION), savedAt: z.number(), rooms: z.array(z.unknown()) });

export function serializeRooms(now = Date.now()) {
  return JSON.stringify({ version: SNAPSHOT_VERSION, savedAt: now, rooms: exportRooms().map(encode) });
}

// Never logs the file's contents or parser messages (both can quote it): only fixed reasons and counts.
export function parseSnapshot(text: string, now = Date.now()): SavedRoom[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    log.warn({ reason: "not_json" }, "Ignoring the rooms snapshot");
    return null;
  }
  const file = fileSchema.safeParse(json);
  if (!file.success) {
    log.warn({ reason: isRecord(json) && json.version !== SNAPSHOT_VERSION ? "unknown_version" : "bad_shape" }, "Ignoring the rooms snapshot");
    return null;
  }
  const stale = now - file.data.savedAt > STALE_CLOCK_MS;
  const restored: SavedRoom[] = [];
  let skipped = 0;
  for (const candidate of file.data.rooms) {
    const parsed = savedRoomSchema.safeParse(decode(candidate));
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const room = parsed.data as unknown as SavedRoom;
    if (stale) {
      for (const stream of room.streams) {
        if (!stream.playback.playing || stream.source.isLive || stream.playback.position === null) continue;
        stream.playback = { position: expectedPosition(stream.playback, file.data.savedAt), playing: false, updatedAt: now };
      }
    }
    restored.push(room);
  }
  if (skipped) log.warn({ skipped }, "Skipped rooms that failed to validate in the snapshot");
  return restored;
}

// Atomic: a crash mid-write leaves the previous file in place. 0600 because it holds password hashes and salts.
export function writeSnapshot(path: string, now = Date.now()) {
  const data = serializeRooms(now);
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, path);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {}
    throw error;
  }
}

export function restoreSnapshot(path: string, now = Date.now()) {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") log.warn({ code: (error as NodeJS.ErrnoException).code }, "Couldn't read the rooms snapshot");
    return 0;
  }
  const rooms = parseSnapshot(text, now);
  return rooms ? importRooms(rooms, now) : 0;
}

// Restores before the server listens, then saves every INTERVAL_MS (a crash loses at most that) and once more on shutdown.
export function startSnapshots(path: string) {
  const restored = restoreSnapshot(path);
  const save = () => {
    try {
      writeSnapshot(path);
    } catch (error) {
      log.error({ code: (error as NodeJS.ErrnoException).code }, "Couldn't write the rooms snapshot");
    }
  };
  setInterval(save, INTERVAL_MS).unref();
  onShutdown(save);
  return restored;
}
