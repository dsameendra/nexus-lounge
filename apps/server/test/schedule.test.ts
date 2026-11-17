import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import WebSocket from "ws";
import { signSessionToken } from "@nexus/shared/session-token";
import { MAX_SCHEDULED_ROOMS_PER_HOST, SCHEDULE_MAX_AHEAD_MS, roomInfoSchema, type RoomState, type ServerMessage } from "@nexus/shared";

const SECRET = "test-secret-test-secret-123456";
Object.assign(process.env, { AUTH_SECRET: SECRET, LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" });

const { attachWebSocket } = await import("../src/ws.ts");
const rooms = await import("../src/rooms.ts");

const MINUTE = 60_000;
const TTL = 30 * MINUTE;
const user = (sub: string) => ({ sub, name: sub, image: null, guest: false });

const server = createServer();
const sockets = attachWebSocket(server);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
after(async () => {
  await sockets.closeAll(1001, "test over", 50);
  await new Promise((resolve) => server.close(resolve));
});

class Client {
  socket = new WebSocket(url);
  state: RoomState | null = null;
  errors: string[] = [];
  constructor() {
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (message.type === "state") this.state = message.state;
      if (message.type === "error") this.errors.push(message.message);
    });
  }
  send(message: object) {
    this.socket.send(JSON.stringify(message));
  }
  async until(check: () => boolean, ms = 3000) {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timeout; errors=${this.errors.join("|")}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

async function join(roomId: string, sub: string) {
  const client = new Client();
  await new Promise((resolve) => client.socket.once("open", resolve));
  client.send({ type: "join", roomId, ticket: signSessionToken({ ...user(sub), room: roomId }, SECRET) });
  await client.until(() => client.state !== null);
  return client;
}

test("start time: host only, validated, clearable, shared with everyone", async () => {
  const { id } = rooms.createRoom("sched-host");
  const host = await join(id, "sched-host");
  const member = await join(id, "sched-member");
  assert.equal(host.state!.room.startsAt, null);

  const soon = Date.now() + 2 * 60 * MINUTE;
  member.send({ type: "settings.update", startsAt: soon });
  await member.until(() => member.errors.length === 1);
  assert.equal(host.state!.room.startsAt, null, "only the host can schedule");

  host.send({ type: "settings.update", startsAt: Date.now() - MINUTE });
  await host.until(() => host.errors.some((message) => message.includes("future")));
  host.send({ type: "settings.update", startsAt: Date.now() + SCHEDULE_MAX_AHEAD_MS + MINUTE });
  await host.until(() => host.errors.some((message) => message.includes("30 days")));
  host.send({ type: "settings.update", startsAt: "tomorrow" });
  host.send({ type: "settings.update", startsAt: soon + 0.5 });
  await host.until(() => host.errors.filter((message) => message.includes("Invalid")).length === 2);
  assert.equal(host.state!.room.startsAt, null, "rejected times change nothing");

  host.send({ type: "settings.update", startsAt: soon });
  await member.until(() => member.state!.room.startsAt === soon);
  assert.deepEqual(member.state!.room.settings, { guests: "ask", sharing: "everyone", locked: false, autoplayNext: true, reactions: true }, "the start time is not a room setting");

  host.send({ type: "settings.update", locked: true });
  await member.until(() => member.state!.room.settings.locked);
  assert.equal(member.state!.room.startsAt, soon, "other changes keep the start time");

  host.send({ type: "settings.update", startsAt: null });
  await member.until(() => member.state!.room.startsAt === null);
  [host, member].forEach((client) => client.socket.close());
});

test("room info parses without a start time (older payloads)", () => {
  const info = roomInfoSchema.parse({ id: "abcdefgh", name: "", settings: { guests: "ask", sharing: "everyone", locked: false, autoplayNext: true, reactions: true }, hostId: "h", controllerIds: [], createdAt: 1, hasPassword: false });
  assert.equal(info.startsAt, null);
});

test("an empty scheduled room survives until its start time plus the usual grace", () => {
  const host = user("sweep-host");
  const now = Date.now();
  const plain = rooms.createRoom(host.sub);
  const scheduled = rooms.createRoom(host.sub);
  const startsAt = now + 3 * 60 * MINUTE;
  assert.deepEqual(rooms.updateSettings(scheduled.id, host, { startsAt }), { ok: true });

  rooms.sweepEmptyRooms(now + TTL + MINUTE);
  assert.equal(rooms.hasRoom(plain.id), false, "an unscheduled empty room goes after the usual grace");
  assert.equal(rooms.hasRoom(scheduled.id), true, "a scheduled one is kept");

  rooms.sweepEmptyRooms(startsAt + TTL - MINUTE);
  assert.equal(rooms.hasRoom(scheduled.id), true, "still kept until the grace after the start runs out");
  rooms.sweepEmptyRooms(startsAt + TTL + MINUTE);
  assert.equal(rooms.hasRoom(scheduled.id), false, "then it goes like any empty room");
});

test("a start time well past is cleared, and the room then ages out normally", async () => {
  const { id } = rooms.createRoom("expiry-host");
  const startsAt = Date.now() + 10 * MINUTE;
  rooms.updateSettings(id, user("expiry-host"), { startsAt });
  const host = await join(id, "expiry-host");

  rooms.sweepEmptyRooms(startsAt + MINUTE);
  assert.equal(rooms.getRoom(id)!.startsAt, startsAt, "kept just after the start");
  rooms.sweepEmptyRooms(startsAt + TTL + MINUTE);
  await host.until(() => host.state!.room.startsAt === null);
  assert.equal(rooms.hasRoom(id), true, "an occupied room is never swept");
  host.socket.close();
});

test("one host can hold only a few scheduled rooms", () => {
  const host = user("cap-host");
  const startsAt = Date.now() + 60 * MINUTE;
  const ids = Array.from({ length: MAX_SCHEDULED_ROOMS_PER_HOST + 1 }, () => rooms.createRoom(host.sub).id);
  for (const id of ids.slice(0, -1)) assert.deepEqual(rooms.updateSettings(id, host, { startsAt }), { ok: true });
  const extra = ids.at(-1)!;
  const refused = rooms.updateSettings(extra, host, { startsAt });
  assert.equal(refused.ok, false);
  assert.equal(rooms.getRoom(extra)!.startsAt, null);

  assert.deepEqual(rooms.updateSettings(ids[0]!, host, { startsAt: startsAt + MINUTE }), { ok: true }, "moving an existing start time is fine");
  assert.deepEqual(rooms.updateSettings(extra, host, { name: "Still editable" }), { ok: true }, "other settings are not affected by the cap");
  assert.deepEqual(rooms.updateSettings(ids[0]!, host, { startsAt: null }), { ok: true });
  assert.deepEqual(rooms.updateSettings(extra, host, { startsAt }), { ok: true }, "clearing one frees a slot");
  assert.deepEqual(rooms.updateSettings(rooms.createRoom("cap-other").id, user("cap-other"), { startsAt }), { ok: true }, "the cap is per host");
});
