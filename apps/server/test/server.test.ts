import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { signSessionToken } from "@nexus/shared/session-token";
import type { RoomState, ServerMessage } from "@nexus/shared";

const SECRET = "test-secret-test-secret-123456";
const PORT = 4311;
const base = `http://localhost:${PORT}`;
let child: ChildProcess;

const user = (sub: string, guest = false) => ({ sub, name: sub, image: null, guest });
const bearer = (sub: string, guest = false) => ({
  authorization: `Bearer ${signSessionToken(user(sub, guest), SECRET)}`,
  "content-type": "application/json",
});

before(async () => {
  child = spawn("node", ["src/index.ts"], {
    env: { ...process.env, PORT: String(PORT), AUTH_SECRET: SECRET, LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
});
after(() => child.kill());

async function createRoom(host: string, password?: string) {
  const response = await fetch(`${base}/rooms`, { method: "POST", headers: bearer(host), body: JSON.stringify(password ? { password } : {}) });
  return (await response.json()) as { id: string };
}

async function ticketFor(roomId: string, sub: string, guest = false, password?: string) {
  const response = await fetch(`${base}/rooms/${roomId}/livekit-token`, {
    method: "POST",
    headers: bearer(sub, guest),
    body: JSON.stringify(password ? { password } : {}),
  });
  return { status: response.status, body: response.ok ? ((await response.json()) as { wsTicket: string }) : null };
}

class Client {
  socket = new WebSocket(`ws://localhost:${PORT}/ws`);
  state: RoomState | null = null;
  errors: string[] = [];
  private waiters: (() => void)[] = [];

  constructor() {
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (message.type === "state") this.state = message.state;
      if (message.type === "error") this.errors.push(message.message);
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }
  open() {
    return new Promise<void>((resolve) => this.socket.on("open", () => resolve()));
  }
  send(message: object) {
    this.socket.send(JSON.stringify(message));
  }
  async until(check: () => boolean, ms = 2000) {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timeout; errors=${this.errors.join("|")}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
}

async function join(roomId: string, sub: string, guest = false) {
  const { body } = await ticketFor(roomId, sub, guest);
  const client = new Client();
  await client.open();
  client.send({ type: "join", roomId, ticket: body!.wsTicket });
  await client.until(() => client.state !== null);
  return client;
}

const yt = { type: "youtube", id: "dQw4w9WgXcQ", isLive: false };
const ytId = "youtube:dQw4w9WgXcQ";

test("permission matrix", async () => {
  const { id } = await createRoom("host");
  const host = await join(id, "host");
  const alice = await join(id, "alice");
  const guest = await join(id, "guest-1", true);

  guest.send({ type: "stream.add", source: yt });
  await guest.until(() => guest.errors.length > 0);
  assert.equal(host.state!.streams.length, 0);

  alice.send({ type: "stream.add", source: yt });
  await host.until(() => host.state!.streams.length === 1);
  alice.send({ type: "stream.add", source: yt });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(host.state!.streams.length, 1, "duplicate adds are ignored");

  alice.send({ type: "stream.feature", streamId: ytId });
  await alice.until(() => alice.errors.length > 0);
  assert.equal(host.state!.featuredId, null, "non-controller cannot feature");

  host.send({ type: "stream.feature", streamId: ytId });
  await guest.until(() => guest.state!.featuredId === ytId);

  guest.send({ type: "stream.control", streamId: ytId, action: "play", position: 0 });
  await guest.until(() => guest.errors.length > 1);
  assert.equal(host.state!.streams[0]!.playback.playing, false, "guest cannot control");

  host.send({ type: "stream.control", streamId: ytId, action: "play", position: 12 });
  await alice.until(() => alice.state!.streams[0]!.playback.playing);
  const stamped = alice.state!.streams[0]!.playback;
  assert.equal(stamped.position, 12);
  assert.ok(Math.abs(stamped.updatedAt - alice.state!.serverTime) < 2000);

  host.send({ type: "stream.control", streamId: ytId, action: "seek", position: 50 });
  await alice.until(() => alice.state!.streams[0]!.playback.position === 50);
  assert.equal(alice.state!.streams[0]!.playback.playing, true, "seek keeps playing flag");

  alice.send({ type: "stream.control", streamId: ytId, action: "pause", position: 55 });
  await host.until(() => !host.state!.streams[0]!.playback.playing);
  assert.equal(host.state!.streams[0]!.playback.position, 55, "adder can control their own stream");

  alice.send({ type: "role.setController", userId: "alice", enabled: true });
  await alice.until(() => alice.errors.length > 1);
  host.send({ type: "role.setController", userId: "guest-1", enabled: true });
  await host.until(() => host.errors.length > 0);
  host.send({ type: "role.setController", userId: "alice", enabled: true });
  await alice.until(() => alice.state!.room.controllerIds.includes("alice"));
  alice.send({ type: "stream.feature", streamId: null });
  await host.until(() => host.state!.featuredId === null);

  guest.send({ type: "stream.remove", streamId: ytId });
  await guest.until(() => guest.errors.length > 2);
  assert.equal(host.state!.streams.length, 1);

  alice.send({ type: "presence.watch", streamId: ytId });
  await host.until(() => host.state!.members.find((m) => m.id === "alice")?.watching === ytId);
  assert.equal(host.state!.members.find((m) => m.id === "guest-1")?.guest, true);

  host.send({ type: "stream.remove", streamId: ytId });
  await host.until(() => host.state!.streams.length === 0);
  assert.equal(host.state!.members.find((m) => m.id === "alice")?.watching, null);

  [host, alice, guest].forEach((client) => client.socket.close());
});

test("guests cannot create rooms", async () => {
  const response = await fetch(`${base}/rooms`, { method: "POST", headers: bearer("guest-9", true), body: "{}" });
  assert.equal(response.status, 403);
});

test("only the host can mute or deafen, and it sticks across reconnects", async () => {
  const { id } = await createRoom("host");
  const host = await join(id, "host");
  const alice = await join(id, "alice");
  const guest = await join(id, "guest-2", true);

  alice.send({ type: "moderation.set", userId: "guest-2", muted: true });
  await alice.until(() => alice.errors.length > 0);
  assert.deepEqual(host.state!.restrictions, {});

  host.send({ type: "moderation.set", userId: "host", muted: true });
  await host.until(() => host.errors.length > 0);

  host.send({ type: "moderation.set", userId: "alice", muted: true });
  await guest.until(() => guest.state!.restrictions["alice"]?.muted === true);
  host.send({ type: "moderation.set", userId: "alice", deafened: true });
  await alice.until(() => alice.state!.restrictions["alice"]?.deafened === true);
  assert.equal(alice.state!.restrictions["alice"]!.muted, true, "patching one flag keeps the other");

  alice.socket.close();
  await host.until(() => host.state!.members.length === 2);
  const again = await join(id, "alice");
  assert.equal(again.state!.restrictions["alice"]?.muted, true, "restriction survives reconnect");

  host.send({ type: "moderation.set", userId: "alice", muted: false, deafened: false });
  await again.until(() => again.state!.restrictions["alice"] === undefined);
  [host, again, guest].forEach((client) => client.socket.close());
});

test("late joiner receives current state; leaving updates members", async () => {
  const { id } = await createRoom("host");
  const host = await join(id, "host");
  host.send({ type: "stream.add", source: yt });
  await host.until(() => host.state!.streams.length === 1);
  host.send({ type: "stream.control", streamId: ytId, action: "play", position: 30 });
  await host.until(() => host.state!.streams[0]!.playback.playing);

  const late = await join(id, "late");
  assert.equal(late.state!.streams[0]!.playback.position, 30);
  assert.equal(late.state!.streams[0]!.playback.playing, true);
  await host.until(() => host.state!.members.length === 2);
  late.socket.close();
  await host.until(() => host.state!.members.length === 1);
  host.socket.close();
});

test("establish only sets an unset position, once", async () => {
  const { id } = await createRoom("host");
  const host = await join(id, "host");
  const alice = await join(id, "alice");
  host.send({ type: "stream.add", source: yt });
  await host.until(() => host.state!.streams.length === 1);
  alice.send({ type: "stream.establish", streamId: ytId, position: 7 });
  await host.until(() => host.state!.streams[0]!.playback.position === 7);
  alice.send({ type: "stream.establish", streamId: ytId, position: 99 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(host.state!.streams[0]!.playback.position, 7);
  [host, alice].forEach((client) => client.socket.close());
});

test("twitch live cannot be controlled", async () => {
  const { id } = await createRoom("host");
  const host = await join(id, "host");
  host.send({ type: "stream.add", source: { type: "twitch", id: "caedrel", isLive: true } });
  await host.until(() => host.state!.streams.length === 1);
  host.send({ type: "stream.control", streamId: "twitch:live:caedrel", action: "play", position: 1 });
  await host.until(() => host.errors.length > 0);
  host.socket.close();
});

test("password and ticket enforcement", async () => {
  const { id } = await createRoom("host", "hunter2");
  assert.equal((await ticketFor(id, "friend")).status, 403);
  assert.equal((await ticketFor(id, "friend", false, "nope")).status, 403);
  assert.equal((await ticketFor(id, "host")).status, 200);
  const ok = await ticketFor(id, "friend", false, "hunter2");
  assert.equal(ok.status, 200);

  const forged = new Client();
  await forged.open();
  forged.send({ type: "join", roomId: id, ticket: signSessionToken(user("friend"), SECRET) });
  await forged.until(() => forged.errors.includes("Unauthorized"));

  const other = await createRoom("host");
  const wrongRoom = new Client();
  await wrongRoom.open();
  wrongRoom.send({ type: "join", roomId: other.id, ticket: ok.body!.wsTicket });
  await wrongRoom.until(() => wrongRoom.errors.includes("Unauthorized"));

  const asRest = await fetch(`${base}/rooms`, { method: "POST", headers: { authorization: `Bearer ${ok.body!.wsTicket}` }, body: "{}" });
  assert.equal(asRest.status, 401, "a ws ticket is not a REST credential");

  const badMessage = new Client();
  await badMessage.open();
  badMessage.send({ type: "stream.add", source: { type: "youtube", id: "../etc", isLive: false } });
  await badMessage.until(() => badMessage.errors.length > 0);
  [forged, wrongRoom, badMessage].forEach((client) => client.socket.close());
});
