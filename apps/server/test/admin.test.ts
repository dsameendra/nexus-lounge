import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { signAdminRequest } from "@nexus/shared/admin-token";
import { signSessionToken } from "@nexus/shared/session-token";

const AUTH = "test-secret-test-secret-123456";
const ADMIN = "admin-secret-admin-secret-admin-secret-1234";
const ADMIN_ID = "123456789012345678";
const OTHER_ID = "987654321098765432";
const ON = 4312;
const OFF = 4313;
const children: ChildProcess[] = [];

function start(port: number, extra: Record<string, string>) {
  const child = spawn("node", ["src/index.ts"], {
    env: { ...process.env, PORT: String(port), AUTH_SECRET: AUTH, LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s", ...extra },
    stdio: "ignore",
  });
  children.push(child);
  return (async () => {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/health`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("server did not start");
  })();
}

before(async () => {
  await Promise.all([start(ON, { ADMIN_SECRET: ADMIN, ADMIN_DISCORD_IDS: ` ${ADMIN_ID}, ,not-an-id` }), start(OFF, {})]);
});
after(() => children.forEach((child) => child.kill()));

const get = (port: number, path: string, token?: string) =>
  fetch(`http://localhost:${port}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

const forge = (header: object, claims: object, secret = ADMIN) => {
  const body = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
};
const now = () => Math.floor(Date.now() / 1000);
const claims = (over: object = {}) => ({ iss: "nexus-web", aud: "admin", act: "view", sub: ADMIN_ID, jti: crypto.randomUUID(), iat: now(), exp: now() + 60, ...over });

// The server with admin disabled has no such route, so its 404 for this path is the reference.
async function stockNotFound() {
  const response = await get(OFF, "/admin/overview");
  return { status: response.status, body: await response.text() };
}

test("admin overview: every failure is the stock 404", async () => {
  const stock = await stockNotFound();
  assert.equal(stock.status, 404);
  const attempts: [string, string | undefined][] = [
    ["no token", undefined],
    ["garbage", "not.a.token"],
    ["signed with AUTH_SECRET", signAdminRequest(ADMIN_ID, AUTH)],
    ["not on the allowlist", signAdminRequest(OTHER_ID, ADMIN)],
    ["session token", signSessionToken({ sub: ADMIN_ID, name: "x", image: null, guest: false }, ADMIN)],
    ["wrong audience", forge({ alg: "HS256", typ: "JWT" }, claims({ aud: "admin-session" }))],
    ["wrong issuer", forge({ alg: "HS256", typ: "JWT" }, claims({ iss: "someone" }))],
    ["expired", forge({ alg: "HS256", typ: "JWT" }, claims({ iat: now() - 200, exp: now() - 100 }))],
    ["lifetime too long", forge({ alg: "HS256", typ: "JWT" }, claims({ exp: now() + 3600 }))],
    ["extra claims", forge({ alg: "HS256", typ: "JWT" }, claims({ admin: true }))],
    ["guest-style subject", forge({ alg: "HS256", typ: "JWT" }, claims({ sub: "guest-1234" }))],
    ["alg none", `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims())).toString("base64url")}.`],
    ["wrong alg header", forge({ alg: "HS512", typ: "JWT" }, claims())],
  ];
  for (const [label, token] of attempts) {
    const response = await get(ON, "/admin/overview", token);
    assert.equal(response.status, stock.status, label);
    assert.equal(await response.text(), stock.body, `${label}: body must match the stock 404`);
  }
  const post = await fetch(`http://localhost:${ON}/admin/overview`, { method: "POST", headers: { authorization: `Bearer ${signAdminRequest(ADMIN_ID, ADMIN)}` } });
  assert.equal(post.status, 404);
});

test("admin overview: valid token works once, leaks nothing sensitive", async () => {
  const host = `Host‮${"x".repeat(60)}`;
  const created = await fetch(`http://localhost:${ON}/rooms`, {
    method: "POST",
    headers: { authorization: `Bearer ${signSessionToken({ sub: "555555555555555555", name: host, image: null, guest: false }, AUTH)}`, "content-type": "application/json" },
    body: JSON.stringify({ password: "hunter2-secret", name: "Movie night" }),
  });
  assert.equal(created.status, 201);

  const token = signAdminRequest(ADMIN_ID, ADMIN);
  const response = await get(ON, "/admin/overview", token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  const text = await response.text();
  for (const forbidden of ["hash", "salt", "ticket", "token", "secret", "hunter2", "pending", "restriction", "image"]) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), `response must not contain "${forbidden}"`);
  }
  assert.ok(!/[‮​]/.test(text), "invisible and bidi characters are stripped");
  const data = JSON.parse(text) as { totals: object; truncated: boolean; rooms: { name: string; hasPassword: boolean; members: object[] }[] };
  assert.deepEqual(Object.keys(data).sort(), ["generatedAt", "rooms", "totals", "truncated"]);
  const room = data.rooms.find((entry) => entry.name === "Movie night");
  assert.ok(room);
  assert.equal(room.hasPassword, true);
  assert.deepEqual(Object.keys(room).sort(), ["createdAt", "hasPassword", "host", "id", "memberCount", "members", "name", "playing", "tvCount"]);

  const replay = await get(ON, "/admin/overview", token);
  assert.equal(replay.status, 404, "a token can be used only once");
});

test("admin overview: not registered when admin is not configured", async () => {
  const unknown = await (await get(OFF, "/admin/other")).text();
  const response = await get(OFF, "/admin/overview", signAdminRequest(ADMIN_ID, ADMIN));
  assert.equal(response.status, 404);
  assert.equal(await response.text(), unknown.replace("other", "overview"));
});

const post = (path: string, token: string, body?: object) =>
  fetch(`http://localhost:${ON}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

const userToken = (sub: string, name: string) => signSessionToken({ sub, name, image: null, guest: false }, AUTH);

async function openRoom(hostSub: string, others: string[]) {
  const created = await fetch(`http://localhost:${ON}/rooms`, { method: "POST", headers: { authorization: `Bearer ${userToken(hostSub, "Host")}`, "content-type": "application/json" }, body: "{}" });
  const { id } = (await created.json()) as { id: string };
  const sockets: { sub: string; socket: WebSocket; closed: Promise<number>; messages: string[] }[] = [];
  for (const sub of [hostSub, ...others]) {
    const response = await fetch(`http://localhost:${ON}/rooms/${id}/livekit-token`, { method: "POST", headers: { authorization: `Bearer ${userToken(sub, sub === hostSub ? "Host" : `Member ${sub.slice(-2)}`)}`, "content-type": "application/json" }, body: "{}" });
    const { wsTicket } = (await response.json()) as { wsTicket: string };
    const socket = new WebSocket(`ws://localhost:${ON}/ws`);
    const messages: string[] = [];
    const closed = new Promise<number>((resolve) => socket.on("close", (code) => resolve(code)));
    socket.on("message", (raw) => messages.push(raw.toString()));
    await new Promise((resolve) => socket.on("open", resolve));
    socket.send(JSON.stringify({ type: "join", roomId: id, ticket: wsTicket }));
    sockets.push({ sub, socket, closed, messages });
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { id, sockets };
}

async function overview() {
  const response = await get(ON, "/admin/overview", signAdminRequest(ADMIN_ID, ADMIN));
  return (await response.json()) as { rooms: { id: string; members: { ref: string; name: string; host: boolean }[] }[] };
}

test("admin actions: tokens are bound to one operation", async () => {
  const room = await openRoom("700000000000000001", []);
  const stock = await (await get(OFF, `/admin/rooms/${room.id}/close`)).text();
  void stock;
  const wrong = [
    ["view token", signAdminRequest(ADMIN_ID, ADMIN)],
    ["close for another room", signAdminRequest(ADMIN_ID, ADMIN, { act: "close", room: "zzzzzzzz" })],
    ["signed with AUTH_SECRET", signAdminRequest(ADMIN_ID, AUTH, { act: "close", room: room.id })],
    ["not on the allowlist", signAdminRequest(OTHER_ID, ADMIN, { act: "close", room: room.id })],
  ] as const;
  for (const [label, token] of wrong) {
    const response = await post(`/admin/rooms/${room.id}/close`, token);
    assert.equal(response.status, 404, label);
  }
  const closeToken = signAdminRequest(ADMIN_ID, ADMIN, { act: "close", room: room.id });
  const viewOnClose = await get(ON, "/admin/overview", closeToken);
  assert.equal(viewOnClose.status, 404, "an action token can't read the overview");
  assert.ok((await overview()).rooms.some((entry) => entry.id === room.id), "the room survived every refused attempt");
  for (const { socket } of room.sockets) socket.close();
});

test("admin actions: closing a room disconnects everyone and deletes it", async () => {
  const room = await openRoom("700000000000000002", ["700000000000000003"]);
  const token = signAdminRequest(ADMIN_ID, ADMIN, { act: "close", room: room.id });
  const response = await post(`/admin/rooms/${room.id}/close`, token);
  assert.equal(response.status, 200);
  for (const { closed, messages } of room.sockets) {
    assert.equal(await closed, 4002);
    assert.ok(messages.some((message) => message.includes("closed by the operator")));
  }
  assert.ok(!(await overview()).rooms.some((entry) => entry.id === room.id));
  assert.equal((await post(`/admin/rooms/${room.id}/close`, token)).status, 404, "a token can't be replayed");
  const again = await post(`/admin/rooms/${room.id}/close`, signAdminRequest(ADMIN_ID, ADMIN, { act: "close", room: room.id }));
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "gone" });
  const rejoin = await fetch(`http://localhost:${ON}/rooms/${room.id}/livekit-token`, { method: "POST", headers: { authorization: `Bearer ${userToken("700000000000000003", "Member")}`, "content-type": "application/json" }, body: "{}" });
  assert.equal(rejoin.status, 404);
});

test("admin actions: removing a person keeps them out, but never the host", async () => {
  const host = "700000000000000004";
  const member = "700000000000000005";
  const room = await openRoom(host, [member]);
  const entry = (await overview()).rooms.find((candidate) => candidate.id === room.id)!;
  const hostRef = entry.members.find((candidate) => candidate.host)!.ref;
  const memberRef = entry.members.find((candidate) => !candidate.host)!.ref;
  assert.ok(!JSON.stringify(entry).includes(member), "member ids are not exposed");

  const hostTry = await post(`/admin/rooms/${room.id}/remove`, signAdminRequest(ADMIN_ID, ADMIN, { act: "remove", room: room.id, ref: hostRef }), { ref: hostRef });
  assert.equal(hostTry.status, 409);
  assert.deepEqual(await hostTry.json(), { error: "host" });

  const mismatch = await post(`/admin/rooms/${room.id}/remove`, signAdminRequest(ADMIN_ID, ADMIN, { act: "remove", room: room.id, ref: hostRef }), { ref: memberRef });
  assert.equal(mismatch.status, 404, "the token must name the same person as the body");

  const removed = await post(`/admin/rooms/${room.id}/remove`, signAdminRequest(ADMIN_ID, ADMIN, { act: "remove", room: room.id, ref: memberRef }), { ref: memberRef });
  assert.equal(removed.status, 200);
  const gone = room.sockets.find((candidate) => candidate.sub === member)!;
  assert.equal(await gone.closed, 4001);
  const rejoin = await fetch(`http://localhost:${ON}/rooms/${room.id}/livekit-token`, { method: "POST", headers: { authorization: `Bearer ${userToken(member, "Member")}`, "content-type": "application/json" }, body: "{}" });
  assert.equal(rejoin.status, 403, "a removed person can't come back");
  const after = (await overview()).rooms.find((candidate) => candidate.id === room.id)!;
  assert.equal(after.members.length, 1);
  const stillThere = await post(`/admin/rooms/${room.id}/remove`, signAdminRequest(ADMIN_ID, ADMIN, { act: "remove", room: room.id, ref: memberRef }), { ref: memberRef });
  assert.equal(stillThere.status, 409);
  for (const { socket } of room.sockets) socket.close();
});
