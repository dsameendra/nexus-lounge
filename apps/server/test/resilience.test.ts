import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import WebSocket from "ws";
import { signSessionToken } from "@nexus/shared/session-token";
import type { RoomState, ServerMessage } from "@nexus/shared";

const SECRET = "test-secret-test-secret-123456";
const env = { AUTH_SECRET: SECRET, LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" };
Object.assign(process.env, env);

const { attachWebSocket } = await import("../src/ws.ts");
const rooms = await import("../src/rooms.ts");
const { guard, setLogger } = await import("../src/log.ts");

const logs: { level: string; context: Record<string, unknown>; message: string }[] = [];
setLogger({
  error: (context, message) => logs.push({ level: "error", context: context as Record<string, unknown>, message }),
  warn: (context, message) => logs.push({ level: "warn", context: context as Record<string, unknown>, message }),
});

const cleanups: (() => unknown)[] = [];
after(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

async function start(options: Parameters<typeof attachWebSocket>[1] = {}) {
  const server = createServer();
  const sockets = attachWebSocket(server, options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    await sockets.closeAll(1001, "test over", 50);
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`, sockets };
}

class Client {
  socket: WebSocket;
  state: RoomState | null = null;
  messages: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;

  constructor(url: string, options: WebSocket.ClientOptions = {}) {
    this.socket = new WebSocket(url, options);
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(message);
      if (message.type === "state") this.state = message.state;
    });
    this.socket.on("close", (code, reason) => (this.closed = { code, reason: reason.toString() }));
    this.socket.on("error", () => {});
  }
  open() {
    return new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }
  send(message: object) {
    this.socket.send(JSON.stringify(message));
  }
  async until(check: () => boolean, ms = 3000) {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timeout");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

async function joinRoom(url: string, roomId: string, sub: string, options?: WebSocket.ClientOptions) {
  const client = new Client(url, options);
  await client.open();
  const ticket = signSessionToken({ sub, name: sub, image: null, guest: false, room: roomId }, SECRET);
  client.send({ type: "join", roomId, ticket });
  await client.until(() => client.state !== null);
  return client;
}

const errors = (client: Client) => client.messages.flatMap((message) => (message.type === "error" ? [message.message] : []));

test("a handler that throws or rejects does not take the server down", async () => {
  const { url } = await start({
    handler: (_roomId, _user, message) => {
      if (message.type === "queue.clear") throw new Error("sync boom");
      if (message.type === "presence.voice") return Promise.reject(new Error("async boom"));
      return { ok: false, message: "handled" };
    },
  });
  const { id } = rooms.createRoom("host");
  const client = await joinRoom(url, id, "host");
  const before = logs.length;

  client.send({ type: "queue.clear" });
  await client.until(() => errors(client).length === 1);
  client.send({ type: "presence.voice", deafened: true });
  await client.until(() => errors(client).length === 2);
  assert.deepEqual(errors(client), ["Something went wrong", "Something went wrong"]);

  const failures = logs.slice(before).filter((entry) => entry.message === "WebSocket message failed");
  assert.deepEqual(
    failures.map((entry) => [entry.context.roomId, entry.context.type, (entry.context.err as Error).message]),
    [
      [id, "queue.clear", "sync boom"],
      [id, "presence.voice", "async boom"],
    ],
  );
  assert.ok(!JSON.stringify(logs).includes("ticket"), "never logs message contents");

  client.send({ type: "ping", clientTime: 1 });
  await client.until(() => client.messages.some((message) => message.type === "pong"));
  client.send({ type: "queue.move", queueId: "x", direction: "up" });
  await client.until(() => errors(client).length === 3);
  assert.equal(errors(client)[2], "handled", "the same socket keeps working");
  assert.equal(client.closed, null);
});

test("an oversized frame closes that socket without crashing the server", async () => {
  const { url } = await start();
  const client = new Client(url);
  await client.open();
  client.socket.send("x".repeat(20_000));
  await client.until(() => client.closed !== null);
  assert.equal(client.closed!.code, 1009);
  assert.ok(logs.some((entry) => entry.message === "WebSocket connection error"));

  const next = new Client(url);
  await next.open();
  next.send({ type: "ping", clientTime: 2 });
  await next.until(() => next.messages.some((message) => message.type === "pong"));
});

test("a socket that stops answering pings is terminated and the member disconnected", async () => {
  const { url } = await start({ heartbeatMs: 80 });
  const { id } = rooms.createRoom("host");
  const host = await joinRoom(url, id, "host");
  const sleepy = await joinRoom(url, id, "sleepy", { autoPong: false });
  await host.until(() => host.state!.members.length === 2);

  await sleepy.until(() => sleepy.closed !== null, 1000);
  assert.equal(sleepy.closed!.code, 1006, "terminated, not closed politely");
  await host.until(() => host.state!.members.length === 1);
  assert.deepEqual(host.state!.members.map((member) => member.id), ["host"]);
  assert.deepEqual(rooms.connectedUsers(id).map((user) => user.sub), ["host"]);

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(host.closed, null, "a socket that answers pings stays connected");
});

test("stopAccepting turns new sockets away and closeAll closes open ones with the given code", async () => {
  const { url, sockets } = await start();
  const { id } = rooms.createRoom("host");
  const host = await joinRoom(url, id, "host");
  sockets.stopAccepting(1012, "Server restarting");
  const late = new Client(url);
  await late.until(() => late.closed !== null);
  assert.deepEqual(late.closed, { code: 1012, reason: "Server restarting" }, "a new connection is turned away");
  assert.equal(host.closed, null, "open sockets stay until closeAll");
  await sockets.closeAll(1012, "Server restarting");
  await host.until(() => host.closed !== null);
  assert.deepEqual(host.closed, { code: 1012, reason: "Server restarting" });
  assert.equal(rooms.connectedUsers(id).length, 0);
});

test("guard logs synchronous throws and rejections instead of letting them escape", async () => {
  const before = logs.length;
  guard("sync", () => {
    throw new Error("one");
  }, { roomId: "r" });
  guard("async", () => Promise.reject(new Error("two")));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    logs.slice(before).map((entry) => [entry.message, (entry.context.err as Error).message]),
    [
      ["sync failed", "one"],
      ["async failed", "two"],
    ],
  );
});

test("SIGTERM closes every socket with 1012 and the process exits cleanly", async () => {
  const port = 4314;
  const child = spawn("node", ["src/index.ts"], { env: { ...process.env, ...env, PORT: String(port) }, stdio: "ignore" });
  cleanups.push(() => child.kill("SIGKILL"));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const headers = { authorization: `Bearer ${signSessionToken({ sub: "host", name: "host", image: null, guest: false }, SECRET)}`, "content-type": "application/json" };
  const { id } = (await (await fetch(`${base}/rooms`, { method: "POST", headers, body: "{}" })).json()) as { id: string };
  const client = await joinRoom(`ws://localhost:${port}/ws`, id, "host");

  const started = Date.now();
  child.kill("SIGTERM");
  await client.until(() => client.closed !== null);
  assert.deepEqual(client.closed, { code: 1012, reason: "Server restarting" });
  assert.equal(await exited, 0);
  assert.ok(Date.now() - started < 4000, "shutdown is prompt");
});
