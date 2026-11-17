import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { signSessionToken } from "@nexus/shared/session-token";
import type { ChatLine, RoomState, ServerMessage } from "@nexus/shared";

const SECRET = "test-secret-test-secret-123456";
const PORT = 4321;
const base = `http://localhost:${PORT}`;
let child: ChildProcess;

const bearer = (sub: string, name = sub) => ({
  authorization: `Bearer ${signSessionToken({ sub, name, image: null, guest: false }, SECRET)}`,
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

const pause = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoom(host: string) {
  const response = await fetch(`${base}/rooms`, { method: "POST", headers: bearer(host), body: "{}" });
  return ((await response.json()) as { id: string }).id;
}

class Client {
  socket = new WebSocket(`ws://localhost:${PORT}/ws`);
  state: RoomState | null = null;
  errors: string[] = [];
  lines: ChatLine[] = [];
  history: ChatLine[][] = [];
  kicked = false;
  order: string[] = [];
  private waiters: (() => void)[] = [];

  constructor() {
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      this.order.push(message.type);
      if (message.type === "state") this.state = message.state;
      if (message.type === "error") this.errors.push(message.message);
      if (message.type === "kicked") this.kicked = true;
      if (message.type === "chat") this.lines.push(message.line);
      if (message.type === "chat.history") this.history.push(message.lines);
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }
  open() {
    return new Promise<void>((resolve) => this.socket.on("open", () => resolve()));
  }
  send(message: object) {
    this.socket.send(JSON.stringify(message));
  }
  say(text: string) {
    this.send({ type: "chat.send", text });
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

async function connectWith(roomId: string, ticket: string) {
  const client = new Client();
  await client.open();
  client.send({ type: "join", roomId, ticket });
  await client.until(() => client.state !== null || client.errors.length > 0);
  return client;
}

async function ticket(roomId: string, sub: string, name = sub) {
  const response = await fetch(`${base}/rooms/${roomId}/livekit-token`, { method: "POST", headers: bearer(sub, name), body: "{}" });
  return ((await response.json()) as { wsTicket: string }).wsTicket;
}

async function join(roomId: string, sub: string, name = sub) {
  const client = await connectWith(roomId, await ticket(roomId, sub, name));
  await client.until(() => client.history.length === 1);
  return client;
}

test("a line reaches everyone with a server id, time and the sender's identity", async () => {
  const id = await createRoom("host");
  const host = await join(id, "host", "Host");
  const alice = await join(id, "alice", "Alice");
  assert.deepEqual(host.history[0], [], "a new room has no history");

  const before = Date.now();
  alice.send({ type: "chat.send", text: "  hello  ", id: "forged", from: { id: "host", name: "Host" }, at: 1 });
  await host.until(() => host.lines.length === 1);
  await alice.until(() => alice.lines.length === 1);
  const line = host.lines[0]!;
  assert.equal(line.text, "hello", "trimmed");
  assert.deepEqual(line.from, { id: "alice", name: "Alice" }, "identity comes from the session");
  assert.notEqual(line.id, "forged");
  assert.ok(line.at >= before && line.at <= Date.now());
  assert.deepEqual(alice.lines[0], line);
  [host, alice].forEach((client) => client.socket.close());
});

test("history is sent once on join, in order, and is not part of the state", async () => {
  const id = await createRoom("host");
  const host = await join(id, "host");
  for (const text of ["one", "two", "three"]) host.say(text);
  await host.until(() => host.lines.length === 3);

  const late = await join(id, "late");
  assert.deepEqual(late.history[0]!.map((line) => line.text), ["one", "two", "three"]);
  assert.deepEqual(late.history[0], host.lines);
  assert.equal(late.order[0], "chat.history", "history arrives before the first state");
  assert.equal("chat" in (late.state as object), false, "the room state does not carry chat");
  host.say("four");
  await late.until(() => late.lines.length === 1);
  await pause();
  assert.equal(late.history.length, 1, "history is not re-sent on later changes");

  late.socket.close();
  const again = await join(id, "late");
  assert.deepEqual(again.history[0]!.map((line) => line.text), ["one", "two", "three", "four"], "a reconnect gets the history again");
  [host, again].forEach((client) => client.socket.close());
});

test("the history keeps the newest 100 lines", async () => {
  const id = await createRoom("host");
  const people = await Promise.all(Array.from({ length: 13 }, (_, index) => join(id, `p${index}`)));
  for (let round = 0; round < 8; round++) {
    for (const [index, person] of people.entries()) person.say(`${index}-${round}`);
    await people[0]!.until(() => people[0]!.lines.length === (round + 1) * 13);
  }
  const late = await join(id, "late");
  const lines = late.history[0]!;
  assert.equal(lines.length, 100);
  assert.deepEqual(lines.slice(-1)[0], people[0]!.lines.slice(-1)[0]);
  assert.deepEqual(lines, people[0]!.lines.slice(-100), "oldest dropped, order kept");
  [...people, late].forEach((client) => client.socket.close());
});

test("validation: empty, too long and invisible characters", async () => {
  const id = await createRoom("host");
  const host = await join(id, "host");

  host.say("   ");
  await host.until(() => host.errors.length === 1);
  host.say("\u200b\u200d\ufeff \u202e");
  await host.until(() => host.errors.length === 2);
  host.say("x".repeat(501));
  await host.until(() => host.errors.length === 3);
  host.say("x".repeat(1001));
  await host.until(() => host.errors.length === 4);
  assert.equal(host.errors[3], "Invalid message", "the schema refuses oversized text before the room sees it");
  host.send({ type: "chat.send", text: 42 });
  await host.until(() => host.errors.length === 5);
  await pause();
  assert.equal(host.lines.length, 0);

  host.say(`hi\u200b there\u0007\u202e!${" ".repeat(600)}`);
  await host.until(() => host.lines.length === 1);
  assert.equal(host.lines[0]!.text, "hi there!", "invisible and control characters removed, then trimmed");
  host.say("y".repeat(500));
  await host.until(() => host.lines.length === 2);
  assert.equal(host.lines[1]!.text.length, 500, "500 characters is allowed");
  host.socket.close();
});

test("each person is rate limited", async () => {
  const id = await createRoom("host");
  const host = await join(id, "host");
  const alice = await join(id, "alice");
  for (let i = 0; i < 12; i++) alice.say(`spam ${i}`);
  await alice.until(() => alice.errors.length === 4);
  await pause();
  assert.equal(host.lines.length, 8, "eight lines get through");
  assert.match(alice.errors[0]!, /too fast/);
  host.say("the host can still talk");
  await alice.until(() => alice.lines.some((line) => line.text === "the host can still talk"));
  [host, alice].forEach((client) => client.socket.close());
});

test("TVs neither send nor receive; strangers and removed people get nothing", async () => {
  const id = await createRoom("host");
  const host = await join(id, "host");
  const aliceTicket = await ticket(id, "alice");
  const alice = await connectWith(id, aliceTicket);
  host.say("before");
  await host.until(() => host.lines.length === 1);

  const session = await fetch(`${base}/rooms/${id}/tv/session`, { method: "POST", headers: bearer("host"), body: "{}" });
  const tv = await connectWith(id, ((await session.json()) as { wsTicket: string }).wsTicket);
  await pause();
  assert.equal(tv.history.length, 0, "a TV gets no history");
  tv.say("from the tv");
  await tv.until(() => tv.errors.length === 1);
  assert.match(tv.errors[0]!, /TV/);

  const stranger = new Client();
  await stranger.open();
  stranger.say("hello?");
  await stranger.until(() => stranger.errors.length === 1);
  assert.equal(stranger.errors[0], "Join a room first");

  host.send({ type: "moderation.kick", userId: "alice" });
  await alice.until(() => alice.kicked);
  host.say("after");
  await host.until(() => host.lines.length === 2);
  await pause();
  assert.deepEqual(host.lines.map((line) => line.text), ["before", "after"], "the TV and the stranger added nothing");
  assert.deepEqual(alice.lines.map((line) => line.text), ["before"], "a removed person gets no later lines");
  assert.equal(tv.lines.length, 0, "a TV gets no lines");
  const back = await connectWith(id, aliceTicket);
  await pause();
  assert.deepEqual(back.history, [], "a removed person's old ticket gets no history");
  assert.deepEqual(back.errors, ["You were removed from this room"]);
  [host, tv, stranger, back].forEach((client) => client.socket.close());
});
