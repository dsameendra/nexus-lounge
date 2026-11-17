import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import WebSocket from "ws";
import { signSessionToken } from "@nexus/shared/session-token";
import type { RoomState, ServerMessage } from "@nexus/shared";

const SECRET = "test-secret-test-secret-123456";
const env = { AUTH_SECRET: SECRET, LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" };
Object.assign(process.env, env);

const rooms = await import("../src/rooms.ts");
const snapshot = await import("../src/snapshot.ts");
const { attachWebSocket } = await import("../src/ws.ts");
const { setLogger } = await import("../src/log.ts");

const logs: string[] = [];
setLogger({
  error: (context, message) => logs.push(JSON.stringify({ context, message })),
  warn: (context, message) => logs.push(JSON.stringify({ context, message })),
});

const dir = mkdtempSync(join(tmpdir(), "nexus-snapshot-"));
const cleanups: (() => unknown)[] = [() => rmSync(dir, { recursive: true, force: true })];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

const user = (sub: string, guest = false) => ({ sub, name: sub, image: null, guest });
const fakeSocket = () => ({ readyState: 3, OPEN: 1, send() {} }) as unknown as WebSocket;
const ok = (result: { ok: boolean }) => assert.equal(result.ok, true, JSON.stringify(result));
const twitchVod = { type: "twitch" as const, id: "123456789", isLive: false };
const local = { type: "local" as const, id: "0123456789abcdef0123456789abcdef", isLive: false };

function populatedRoom() {
  const { id } = rooms.createRoom("host", "s3cret", "Movie night");
  const host = user("host");
  rooms.connect(id, host, fakeSocket());
  rooms.connect(id, user("friend"), fakeSocket());
  rooms.connect(id, user("guest-a", true), fakeSocket());
  ok(rooms.addStream(id, host, twitchVod));
  ok(rooms.addStream(id, host, local, { name: "film.mkv", size: 1000, duration: 60 }));
  ok(rooms.controlStream(id, host, `twitch:vod:${twitchVod.id}`, "seek", 42));
  ok(rooms.controlStream(id, host, `twitch:vod:${twitchVod.id}`, "play", null));
  ok(rooms.featureStream(id, host, `twitch:vod:${twitchVod.id}`));
  ok(rooms.queueStream(id, host, `twitch:vod:${twitchVod.id}`, "end"));
  ok(rooms.setController(id, host, "friend", true));
  ok(rooms.setModeration(id, host, "guest-a", { muted: true }));
  ok(rooms.setWatching(id, "friend", `twitch:vod:${twitchVod.id}`));
  rooms.requestEntry(id, user("guest-waiting", true));
  rooms.connect(id, user("rude"), fakeSocket());
  ok(rooms.kickUser(id, host, "rude"));
  rooms.requestEntry(id, user("guest-no", true));
  ok(rooms.respondToJoin(id, host, "guest-no", false));
  ok(rooms.updateSettings(id, host, { locked: true, reactions: false }));
  return id;
}

const byId = (saved: rooms.SavedRoom[], id: string) => saved.find((room) => room.info.id === id);

test("encode and decode keep Maps, Sets and Buffers", () => {
  const value = { a: new Map([["x", { b: new Set(["y"]) }]]), c: Buffer.from([1, 2, 3]), d: [null, 1, "s"], e: { nested: true } };
  assert.deepStrictEqual(snapshot.decode(JSON.parse(JSON.stringify(snapshot.encode(value)))), value);
});

test("export, write, restore: the rooms come back equal, with only live presence left behind", () => {
  const id = populatedRoom();
  const before = byId(rooms.exportRooms(), id)!;
  assert.ok(!("connections" in before) && !("pending" in before) && !("emptySince" in before), "runtime fields are not saved");
  assert.ok(before.known.has("friend") && before.blocked.get("rude") === "removed" && before.blocked.get("guest-no") === "declined");

  const path = join(dir, "round-trip.json");
  snapshot.writeSnapshot(path);
  assert.equal(statSync(path).mode & 0o777, 0o600, "only the owner can read it");
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), [], "no temp file is left behind");
  assert.ok(!readFileSync(path, "utf8").includes("s3cret"), "the password itself is never written");

  for (const room of rooms.exportRooms()) rooms.adminCloseRoom(room.info.id);
  assert.equal(rooms.hasRoom(id), false);

  const restoredAt = Date.now();
  assert.ok(snapshot.restoreSnapshot(path, restoredAt) >= 1);
  assert.deepStrictEqual(byId(rooms.exportRooms(), id), before);
  assert.equal(rooms.checkRoomAccess(id, "friend", "s3cret"), "ok", "the password still works");
  assert.equal(rooms.checkRoomAccess(id, "friend", "wrong"), "wrong_password");
  assert.equal(rooms.checkRoomAccess(id, "friend", undefined), "password_required");
  assert.deepEqual(rooms.connectedUsers(id), [], "nobody is connected yet");
  assert.equal(rooms.isMember(id, "friend"), false);
});

test("a returning member reconnects to a restored room; strangers and removed people get what they got before", async () => {
  const id = populatedRoom();
  const path = join(dir, "reconnect.json");
  snapshot.writeSnapshot(path);
  rooms.adminCloseRoom(id);
  snapshot.restoreSnapshot(path);

  assert.equal(rooms.checkEntry(id, user("guest-a", true)), "ok", "an admitted guest passes the locked, ask-first room");
  assert.equal(rooms.checkEntry(id, user("friend")), "ok");
  assert.equal(rooms.checkEntry(id, user("stranger")), "locked", "the room is still locked to new people");
  assert.equal(rooms.checkEntry(id, user("rude")), "removed");
  assert.equal(rooms.checkEntry(id, user("guest-no", true)), "declined");
  assert.equal(rooms.requestEntry(id, user("guest-waiting", true)), "locked", "a request that was pending is not carried over");
  assert.equal(rooms.micBlocked(id, "guest-a"), true, "moderation survives");

  const server = createServer();
  const sockets = attachWebSocket(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    await sockets.closeAll(1001, "test over", 50);
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  const enter = async (sub: string, guest = false) => {
    const socket = new WebSocket(url);
    const messages: ServerMessage[] = [];
    socket.on("message", (raw) => messages.push(JSON.parse(raw.toString()) as ServerMessage));
    await new Promise((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ type: "join", roomId: id, ticket: signSessionToken({ ...user(sub, guest), room: id }, SECRET) }));
    const deadline = Date.now() + 3000;
    while (!messages.some((message) => message.type === "state" || message.type === "error") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    cleanups.push(() => socket.terminate());
    return messages;
  };

  const friend = await enter("friend");
  const state = friend.find((message) => message.type === "state")?.state as RoomState;
  assert.ok(state, "the friend's ticket from before the restart still joins");
  assert.deepEqual(state.members.map((member) => [member.id, member.watching, member.feed]), [["friend", null, null]], "presence starts fresh");
  assert.deepEqual(state.room.controllerIds, ["friend"]);
  assert.equal(state.streams.length, 2, "device streams are kept");
  assert.equal(state.featuredId, `twitch:vod:${twitchVod.id}`);
  assert.deepEqual(state.pending, []);
  const guest = await enter("guest-a", true);
  assert.ok(guest.some((message) => message.type === "state"), "the admitted guest rejoins without asking again");
  const rude = await enter("rude");
  assert.ok(rude.some((message) => message.type === "error" && message.message === "You were removed from this room"));
});

test("restored rooms get the full empty-room grace from the restore, then are swept", () => {
  const { id } = rooms.createRoom("sweeper");
  const path = join(dir, "sweep.json");
  snapshot.writeSnapshot(path);
  rooms.adminCloseRoom(id);
  const restoredAt = Date.now() + 60 * 60 * 1000;
  snapshot.restoreSnapshot(path, restoredAt);
  rooms.sweepEmptyRooms(restoredAt + 29 * 60 * 1000);
  assert.equal(rooms.hasRoom(id), true, "kept while people may still be reconnecting");
  rooms.sweepEmptyRooms(restoredAt + 31 * 60 * 1000);
  assert.equal(rooms.hasRoom(id), false, "swept once nobody came back");
});

test("a playing clock is kept across a short restart and paused where it was after a long outage", () => {
  const { id } = rooms.createRoom("clock");
  const host = user("clock");
  ok(rooms.addStream(id, host, twitchVod));
  ok(rooms.controlStream(id, host, `twitch:vod:${twitchVod.id}`, "seek", 100));
  ok(rooms.controlStream(id, host, `twitch:vod:${twitchVod.id}`, "play", null));
  const playback = () => byId(rooms.exportRooms(), id)!.streams[0]!.playback;
  const saved = { ...playback() };
  const savedAt = saved.updatedAt + 20_000;
  const text = snapshot.serializeRooms(savedAt);
  rooms.adminCloseRoom(id);

  rooms.importRooms(snapshot.parseSnapshot(text, savedAt + 30_000)!.filter((room) => room.info.id === id));
  assert.deepEqual(playback(), saved, "unchanged: the viewers' players kept running through the restart");
  rooms.adminCloseRoom(id);

  const later = savedAt + snapshot.STALE_CLOCK_MS + 1000;
  rooms.importRooms(snapshot.parseSnapshot(text, later)!.filter((room) => room.info.id === id));
  assert.deepEqual(playback(), { position: 120, playing: false, updatedAt: later }, "paused where it was when the snapshot was taken");
});

test("a corrupt, foreign or tampered snapshot is ignored with a warning and never logged", () => {
  const path = join(dir, "corrupt.json");
  const before = rooms.roomCount();
  const marker = "MARKER-SECRET-CONTENT";
  for (const text of [`{"version":1,"savedAt":1,"rooms":[${marker}`, JSON.stringify({ version: 99, savedAt: 1, rooms: [], marker }), JSON.stringify({ marker })]) {
    writeFileSync(path, text);
    const start = logs.length;
    assert.equal(snapshot.restoreSnapshot(path), 0);
    assert.equal(logs.length, start + 1, "one warning");
    assert.ok(!logs.join("\n").includes(marker), "the contents never reach the log");
  }
  assert.equal(rooms.roomCount(), before);

  const { id: good } = rooms.createRoom("good");
  const { id: bad } = rooms.createRoom("bad");
  const text = snapshot.serializeRooms();
  rooms.adminCloseRoom(good);
  rooms.adminCloseRoom(bad);
  const file = JSON.parse(text) as { rooms: { info: { id: string; hasPassword: boolean; name: string } }[] };
  const tampered = file.rooms.find((room) => room.info.id === bad)!;
  tampered.info.hasPassword = true;
  tampered.info.name = marker;
  writeFileSync(path, JSON.stringify({ ...file, rooms: file.rooms.filter((room) => room.info.id === good || room.info.id === bad) }));
  assert.equal(snapshot.restoreSnapshot(path), 1, "the valid room still comes back");
  assert.equal(rooms.hasRoom(good), true);
  assert.equal(rooms.hasRoom(bad), false, "a room that claims a password but has no hash is refused");
  assert.ok(!logs.join("\n").includes(marker));
  assert.equal(snapshot.restoreSnapshot(join(dir, "missing.json")), 0, "no file is a normal first boot");
});

test("SIGTERM tells clients and saves; the next boot restores the room and its stream", async () => {
  const port = 4337;
  const path = join(dir, "boot.json");
  const base = `http://localhost:${port}`;
  const boot = async () => {
    const child = spawn("node", ["src/index.ts"], { env: { ...process.env, ...env, PORT: String(port), ROOMS_SNAPSHOT_PATH: path }, stdio: "ignore" });
    cleanups.push(() => child.kill("SIGKILL"));
    const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { child, exited };
  };
  const headers = (sub: string, guest = false) => ({ authorization: `Bearer ${signSessionToken(user(sub, guest), SECRET)}`, "content-type": "application/json" });
  const connect = async (roomId: string, sub: string) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const messages: ServerMessage[] = [];
    let closed: number | null = null;
    socket.on("message", (raw) => messages.push(JSON.parse(raw.toString()) as ServerMessage));
    socket.on("close", (code) => (closed = code));
    socket.on("error", () => {});
    await new Promise((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ type: "join", roomId, ticket: signSessionToken({ ...user(sub), room: roomId }, SECRET) }));
    const until = async (check: () => boolean) => {
      const deadline = Date.now() + 3000;
      while (!check()) {
        if (Date.now() > deadline) throw new Error("timeout");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    await until(() => messages.some((message) => message.type === "state"));
    return { socket, messages, until, closed: () => closed };
  };

  const first = await boot();
  const { id } = (await (await fetch(`${base}/rooms`, { method: "POST", headers: headers("host"), body: JSON.stringify({ password: "pw" }) })).json()) as { id: string };
  const host = await connect(id, "host");
  host.socket.send(JSON.stringify({ type: "stream.add", source: twitchVod }));
  await host.until(() => host.messages.some((message) => message.type === "state" && message.state.streams.length === 1));
  assert.equal((await fetch(`${base}/rooms/${id}/livekit-token`, { method: "POST", headers: headers("guest-x", true), body: JSON.stringify({ password: "pw" }) })).status, 202, "a guest waits for approval");

  first.child.kill("SIGTERM");
  await host.until(() => host.closed() !== null);
  assert.equal(await first.exited, 0);
  const kinds = host.messages.map((message) => message.type);
  assert.ok(kinds.includes("restarting"), "clients hear about the restart before the socket closes");
  assert.equal(host.closed(), 1012);
  assert.equal(statSync(path).mode & 0o777, 0o600);

  const second = await boot();
  assert.equal((await fetch(`${base}/rooms/${id}`, { headers: headers("host") })).status, 200, "the room is there after the restart");
  const back = await connect(id, "host");
  const state = back.messages.find((message) => message.type === "state")!.state as RoomState;
  assert.deepEqual(state.streams.map((stream) => stream.id), [`twitch:vod:${twitchVod.id}`]);
  assert.equal(state.room.hasPassword, true);
  assert.equal((await fetch(`${base}/rooms/${id}/livekit-token`, { method: "POST", headers: headers("friend"), body: JSON.stringify({ password: "nope" }) })).status, 403, "the password still guards it");
  back.socket.terminate();
  second.child.kill("SIGTERM");
  assert.equal(await second.exited, 0);
});
